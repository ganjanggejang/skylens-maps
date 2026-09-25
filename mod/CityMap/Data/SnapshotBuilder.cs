using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Newtonsoft.Json;

namespace CityMap.Data
{
    internal sealed class SnapshotResult
    {
        internal string Path;
        internal int Warnings;
    }

    internal static class SnapshotBuilder
    {
        private static readonly (string File, string Geometry)[] Sources =
        {
            ("Building_Boundary.json", "Polygon"),
            ("Network_Centerline.json", "LineString"),
            ("Area_Boundary.json", "Polygon"),
            ("POI_Location.json", "Point"),
            ("Route_Centerline.json", "LineString"),
            ("Zoning_Boundary.json", "Polygon"),
            ("Network_Boundary.json", "Polygon")
        };

        private static readonly string[] Rasters =
        {
            "Depth.tif", "Elevation.tif", "WorldDepth.tif", "WorldElevation.tif"
        };

        internal static SnapshotResult Prepare(string exportDirectory, string snapshotsDirectory,
            string stylesDirectory, CancellationToken cancellation = default)
        {
            cancellation.ThrowIfCancellationRequested();
            Directory.CreateDirectory(snapshotsDirectory);
            var ready = Path.Combine(snapshotsDirectory, ".pending-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(ready);
            try { return PrepareCore(exportDirectory, snapshotsDirectory, stylesDirectory, ready, cancellation); }
            finally
            {
                if (Directory.Exists(ready)) Directory.Delete(ready, true);
            }
        }

        private static SnapshotResult PrepareCore(string exportDirectory, string snapshotsDirectory,
            string stylesDirectory, string ready, CancellationToken cancellation)
        {
            var files = new Dictionary<string, Dictionary<string, object>>(StringComparer.Ordinal);
            double[] buildingBounds = null;
            foreach (var source in Sources)
            {
                cancellation.ThrowIfCancellationRequested();
                var input = FindSource(exportDirectory, "GeoJSON", source.File);
                var info = GeoJsonInspector.Inspect(input, source.Geometry);
                if (source.File == "Building_Boundary.json") buildingBounds = (double[])info["bounds"];
                File.Copy(input, Path.Combine(ready, source.File));
                files.Add(source.File, info);
            }

            var cartoFiles = new Dictionary<string, Dictionary<string, object>>(StringComparer.Ordinal);
            foreach (var raster in Rasters)
            {
                cancellation.ThrowIfCancellationRequested();
                var input = FindSource(exportDirectory, "GeoTIFF", raster);
                File.Copy(input, Path.Combine(ready, raster));
                cartoFiles.Add(raster, FileInfo(input));
            }
            if (!Directory.Exists(stylesDirectory))
                throw new DirectoryNotFoundException("Carto styles are missing: " + stylesDirectory);
            var styleFiles = Directory.GetFiles(stylesDirectory, "*", SearchOption.AllDirectories)
                .Select(path => new { Path = path, Relative = path.Substring(stylesDirectory.Length)
                    .TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                    .Replace(Path.DirectorySeparatorChar, '/') })
                .OrderBy(item => item.Relative, StringComparer.Ordinal).ToArray();
            foreach (var style in styleFiles)
            {
                cancellation.ThrowIfCancellationRequested();
                var relative = "Styles/" + style.Relative;
                cartoFiles.Add(relative, FileInfo(style.Path));
            }

            Dictionary<string, object> water;
            try
            {
                cancellation.ThrowIfCancellationRequested();
                var depth = FindSource(exportDirectory, "GeoTIFF", "Depth.tif");
                water = WaterMaskBuilder.Build(depth, Path.Combine(ready, "water-mask.png"), buildingBounds);
            }
            catch (Exception ex)
            {
                var mask = Path.Combine(ready, "water-mask.png");
                if (File.Exists(mask)) File.Delete(mask);
                water = new Dictionary<string, object> { ["error"] = ex.Message };
            }

            var parts = Sources.Select(source => source.File + ":" +
                (files[source.File].TryGetValue("sha256", out var hash) ? hash : "unavailable")).ToList();
            parts.AddRange(Rasters.Select(name => name + ":" + cartoFiles[name]["sha256"]));
            parts.AddRange(styleFiles.Select(style => "Styles/" + style.Relative + ":" +
                cartoFiles["Styles/" + style.Relative]["sha256"]));
            parts.Insert(0, "CityMap-snapshot-layout-v2");
            var datasetId = HashBytes(Encoding.UTF8.GetBytes(string.Join("\n", parts))).Substring(0, 16);
            var manifest = new Dictionary<string, object>
            {
                ["preparedAt"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                ["files"] = files,
                ["cartoFiles"] = cartoFiles,
                ["rasters"] = new Dictionary<string, object> { ["water"] = water },
                ["datasetId"] = datasetId
            };
            var published = Path.Combine(snapshotsDirectory, datasetId);
            cancellation.ThrowIfCancellationRequested();
            if (File.Exists(Path.Combine(published, "manifest.json")))
            {
                Directory.Delete(ready, true);
            }
            else
            {
                if (Directory.Exists(published))
                    throw new IOException("Incomplete snapshot directory already exists: " + published);
                // Move a flat private directory, then restore Carto's folder layout.
                // The manifest is written last, after every file is in its final path.
                var moved = false;
                try
                {
                    for (var attempt = 0; ; attempt++)
                    {
                        cancellation.ThrowIfCancellationRequested();
                        try { Directory.Move(ready, published); moved = true; break; }
                        catch (IOException) when (attempt < 9 && !Directory.Exists(published))
                        {
                            Thread.Sleep(500);
                        }
                    }
                    Directory.CreateDirectory(Path.Combine(published, "GeoJSON"));
                    Directory.CreateDirectory(Path.Combine(published, "GeoTIFF"));
                    Directory.CreateDirectory(Path.Combine(published, "Shapefile"));
                    foreach (var source in Sources)
                    {
                        cancellation.ThrowIfCancellationRequested();
                        File.Move(Path.Combine(published, source.File),
                            Path.Combine(published, "GeoJSON", source.File));
                    }
                    foreach (var raster in Rasters)
                    {
                        cancellation.ThrowIfCancellationRequested();
                        File.Move(Path.Combine(published, raster),
                            Path.Combine(published, "GeoTIFF", raster));
                    }
                    foreach (var style in styleFiles)
                    {
                        cancellation.ThrowIfCancellationRequested();
                        var destination = Path.Combine(published, "Styles",
                            style.Relative.Replace('/', Path.DirectorySeparatorChar));
                        Directory.CreateDirectory(Path.GetDirectoryName(destination));
                        File.Copy(style.Path, destination);
                    }
                    // A snapshot is visible to the server only after this last file appears.
                    var temporaryManifest = Path.Combine(published, ".manifest.tmp");
                    cancellation.ThrowIfCancellationRequested();
                    File.WriteAllText(temporaryManifest,
                        JsonConvert.SerializeObject(manifest, Formatting.Indented) + "\n", new UTF8Encoding(false));
                    File.Move(temporaryManifest, Path.Combine(published, "manifest.json"));
                }
                catch
                {
                    if (moved && !File.Exists(Path.Combine(published, "manifest.json")) &&
                        Directory.Exists(published)) Directory.Delete(published, true);
                    throw;
                }
            }
            return new SnapshotResult
            {
                Path = published,
                Warnings = water.ContainsKey("error") ? 1 : 0
            };
        }

        private static string FindSource(string root, string format, string file)
        {
            var path = Path.Combine(root, format, file);
            if (!File.Exists(path)) throw new FileNotFoundException("Missing Carto output: " + file, path);
            return path;
        }

        internal static string HashFile(string path)
        {
            using (var file = File.OpenRead(path))
            using (var hash = SHA256.Create())
                return Hex(hash.ComputeHash(file));
        }

        private static Dictionary<string, object> FileInfo(string path) => new Dictionary<string, object>
        {
            ["bytes"] = new System.IO.FileInfo(path).Length,
            ["sha256"] = HashFile(path)
        };

        private static string HashBytes(byte[] bytes)
        {
            using (var hash = SHA256.Create()) return Hex(hash.ComputeHash(bytes));
        }

        private static string Hex(byte[] bytes) => BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
    }
}
