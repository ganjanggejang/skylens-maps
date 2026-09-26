using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Reflection;

namespace CityMap.Export
{
    // Build a complete, isolated export without changing the user's Carto settings.
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
            EnableAll(carto, options);
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
                throw new InvalidOperationException("Carto did not export the required GeoJSON/GeoTIFF files: " +
                    string.Join(", ", missing));
            var root = Path.GetFullPath(outputDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (written.Length == 0 || written.Any(path => !path.StartsWith(root, StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(path)))
                throw new InvalidOperationException("Carto reported missing files or files outside the export directory.");
            var onDisk = Directory.GetFiles(outputDirectory, "*", SearchOption.AllDirectories)
                .Select(Path.GetFullPath).ToArray();
            if (onDisk.Any(path => !written.Any(item =>
                string.Equals(item, path, StringComparison.OrdinalIgnoreCase))))
                throw new InvalidOperationException("Carto wrote files absent from its export result.");
        }

        private static void EnableAll(Assembly carto, object options)
        {
            // The enum and availability table come from the installed Carto version.
            foreach (var name in new[] { "Systems", "Features", "RasterKinds" })
                Set(options, name, AllFlags(Get(options, name).GetType()));
            var format = carto.GetType("Carto.IO.FileFormat")
                ?? throw new TypeLoadException("Carto.IO.FileFormat is unavailable.");
            Set(options, "VectorFormat", Enum.Parse(format, "GeoJSON"));
            Set(options, "RasterFormat", Enum.Parse(format, "GeoTIFF"));
            Set(options, "GeoTiffFormat", Enum.Parse(Get(options, "GeoTiffFormat").GetType(), "Int16"));
            Set(options, "FileName", "{Feature}");
            Set(options, "FileNameFormat", Enum.Parse(Get(options, "FileNameFormat").GetType(), "Feature"));
            Set(options, "Elevation", true);
            Set(options, "InactiveRoute", true);
            Set(options, "StatisticsMapTile", true);
            Set(options, "Unzoned", true);
            Set(options, "SeparateServiceUpgrade", true);
            Set(options, "SeparateResident", true);
            Set(options, "Homeless", true);
            Set(options, "PetPassenger", true);
            Set(options, "AssetPack", true);
            Set(options, "XtmAcronym", true);
            Set(options, "ZccColor", true);

            var kinds = Get(options, "VectorKinds") as IDictionary
                ?? throw new InvalidOperationException("Carto vector kinds are unavailable.");
            var allKinds = AllFlags(kinds.GetType().GetGenericArguments()[1]);
            foreach (var system in Enum.GetValues(Get(options, "Systems").GetType()))
                if (Convert.ToInt64(system) != 0 && system.ToString() != "Raster" &&
                    (Convert.ToInt64(system) & (Convert.ToInt64(system) - 1)) == 0)
                    kinds[system] = allKinds;

            var io = carto.GetType("Carto.IO.IO")
                ?? throw new TypeLoadException("Carto.IO.IO is unavailable.");
            var available = io.GetField("AvailablePropertyTable", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null) as IDictionary
                ?? throw new MissingMemberException("Carto.IO.IO.AvailablePropertyTable is unavailable.");
            var properties = Activator.CreateInstance(Get(options, "Properties").GetType()) as IDictionary
                ?? throw new InvalidOperationException("Carto property selections are unavailable.");
            foreach (DictionaryEntry entry in available)
            {
                var source = entry.Value as IEnumerable;
                if (source == null) continue;
                var selection = Activator.CreateInstance(entry.Value.GetType());
                var add = selection.GetType().GetMethod("Add");
                foreach (var property in source) add.Invoke(selection, new[] { property });
                properties.Add(entry.Key, selection);
            }
            Set(options, "Properties", properties);
            var display = Get(options, "Display") as IDictionary;
            if (display != null)
                foreach (var key in display.Keys.Cast<object>().ToArray()) display[key] = true;
        }

        private static object AllFlags(Type type)
        {
            long flags = 0;
            foreach (var value in Enum.GetValues(type)) flags |= Convert.ToInt64(value);
            return Enum.ToObject(type, flags);
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
