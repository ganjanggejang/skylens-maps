using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Reflection;

namespace CityMap.Export
{
    // Use Carto's own export options so a City Map click matches a manual Carto export.
    internal sealed class CartoAdapter
    {
        private static readonly string[] ExpectedVectors =
        {
            "Area_Boundary.json", "Building_Boundary.json", "Network_Boundary.json",
            "Network_Centerline.json", "POI_Location.json", "Route_Centerline.json",
            "Zoning_Boundary.json"
        };

        private static readonly string[] ExpectedRasters =
        {
            "Depth.tif", "Elevation.tif", "WorldDepth.tif", "WorldElevation.tif"
        };

        public void Export(string outputDirectory)
        {
            var carto = AppDomain.CurrentDomain.GetAssemblies()
                .FirstOrDefault(a => a.GetName().Name == "Carto");
            if (carto == null)
                throw new InvalidOperationException("Carto is not loaded. Enable Carto and restart the game.");

            var instance = carto.GetType("Carto.Instance")
                ?? throw new TypeLoadException("Carto.Instance is unavailable.");
            var settings = instance.GetProperty("Settings", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
            if (settings == null)
                throw new InvalidOperationException("Carto settings are not initialized.");
            var getOptions = settings.GetType().GetMethod("GetOptions", BindingFlags.Public | BindingFlags.Instance,
                null, Type.EmptyTypes, null);
            if (getOptions == null)
                throw new MissingMethodException("Carto.Settings.GetOptions() is unavailable.");
            var options = getOptions.Invoke(settings, null);
            if (options == null)
                throw new InvalidOperationException("Carto did not provide export options.");
            var errors = Get(options, "Errors") as IDictionary;
            if (errors != null && errors.Count > 0)
                throw new InvalidOperationException("Check Carto's export settings: " +
                    string.Join(", ", errors.Keys.Cast<object>().Select(Convert.ToString)));

            Directory.CreateDirectory(outputDirectory);
            Set(options, "CustomDirectory", outputDirectory);
            Set(options, "CompletionDialog", false);
            Set(options, "CompletionSound", false);

            var io = carto.GetType("Carto.IO.IO")
                ?? throw new TypeLoadException("Carto.IO.IO is unavailable.");
            var method = io.GetMethod("Export", BindingFlags.Public | BindingFlags.Static,
                null, new[] { options.GetType() }, null);
            if (method == null)
                throw new MissingMethodException("Carto.IO.IO.Export(Carto.IO.Options) is unavailable.");
            var result = method.Invoke(null, new[] { options });
            if (result == null || !(bool)Get(result, "Success"))
                throw new InvalidOperationException("Carto export failed: " +
                    (result == null ? "no result" : Get(result, "ErrorMessage")));

            var written = ((IEnumerable)Get(result, "FilesWritten")).Cast<object>()
                .Select(Convert.ToString).Where(path => !string.IsNullOrEmpty(path))
                .Select(path => Path.GetFullPath(Path.IsPathRooted(path) ? path :
                    Path.Combine(outputDirectory, path))).ToArray();
            var expected = ExpectedVectors.Select(name => Path.Combine(outputDirectory, "GeoJSON", name))
                .Concat(ExpectedRasters.Select(name => Path.Combine(outputDirectory, "GeoTIFF", name)))
                .Select(Path.GetFullPath).ToArray();
            var missing = expected.Where(path => !File.Exists(path) || !written.Any(item =>
                string.Equals(item, Path.GetFullPath(path), StringComparison.OrdinalIgnoreCase)))
                .Select(Path.GetFileName).ToArray();
            if (missing.Length > 0)
                throw new InvalidOperationException("Carto settings did not export the complete GeoJSON/GeoTIFF set: " +
                    string.Join(", ", missing));
            var extra = written.Where(path => !expected.Any(item =>
                string.Equals(item, path, StringComparison.OrdinalIgnoreCase)))
                .Select(Path.GetFileName).ToArray();
            if (extra.Length > 0)
                throw new InvalidOperationException("Carto exported additional files not yet in the snapshot contract: " +
                    string.Join(", ", extra));
        }

        private static void Set(object target, string name, object value)
        {
            var property = target.GetType().GetProperty(name)
                ?? throw new MissingMemberException(target.GetType().FullName, name);
            property.SetValue(target, value);
        }

        private static object Get(object target, string name)
        {
            var property = target.GetType().GetProperty(name)
                ?? throw new MissingMemberException(target.GetType().FullName, name);
            return property.GetValue(target);
        }
    }
}
