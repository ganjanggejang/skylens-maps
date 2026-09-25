using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CityMap.Data
{
    internal static class GeoJsonInspector
    {
        internal static Dictionary<string, object> Inspect(string path, string geometry)
        {
            var bounds = new[] { double.PositiveInfinity, double.PositiveInfinity,
                double.NegativeInfinity, double.NegativeInfinity };
            var objects = new Dictionary<string, int>(StringComparer.Ordinal);
            var count = 0;
            using (var stream = File.OpenRead(path))
            using (var text = new StreamReader(stream))
            using (var reader = new JsonTextReader(text) { DateParseHandling = DateParseHandling.None })
            {
                if (!reader.Read() || reader.TokenType != JsonToken.StartObject)
                    throw new InvalidDataException("GeoJSON root must be an object: " + Path.GetFileName(path));
                var collection = false;
                var features = false;
                while (reader.Read() && reader.TokenType != JsonToken.EndObject)
                {
                    if (reader.TokenType != JsonToken.PropertyName)
                        throw new InvalidDataException("Invalid GeoJSON root: " + Path.GetFileName(path));
                    var name = (string)reader.Value;
                    if (!reader.Read()) throw new InvalidDataException("Truncated GeoJSON: " + path);
                    if (name == "type")
                    {
                        collection = reader.TokenType == JsonToken.String && (string)reader.Value == "FeatureCollection";
                    }
                    else if (name == "features")
                    {
                        if (reader.TokenType != JsonToken.StartArray)
                            throw new InvalidDataException("GeoJSON features must be an array: " + path);
                        features = true;
                        while (reader.Read() && reader.TokenType != JsonToken.EndArray)
                        {
                            if (reader.TokenType != JsonToken.StartObject)
                                throw new InvalidDataException("Invalid GeoJSON feature in " + path);
                            var feature = JObject.Load(reader);
                            if ((string)feature["type"] != "Feature" ||
                                (string)feature["geometry"]?["type"] != geometry ||
                                !(feature["properties"] is JObject properties) ||
                                properties["Object"]?.Type != JTokenType.String)
                                throw new InvalidDataException("Invalid feature " + count + " in " + path);
                            Walk(feature["geometry"]?["coordinates"], bounds);
                            var objectName = (string)properties["Object"];
                            objects[objectName] = objects.TryGetValue(objectName, out var value) ? value + 1 : 1;
                            count++;
                        }
                    }
                    else reader.Skip();
                }
                if (!collection || !features)
                    throw new InvalidDataException("Not a FeatureCollection: " + path);
            }
            return new Dictionary<string, object>
            {
                ["features"] = count,
                ["bytes"] = new FileInfo(path).Length,
                ["sha256"] = SnapshotBuilder.HashFile(path),
                ["bounds"] = count == 0 ? null : bounds,
                ["objects"] = objects
            };
        }

        private static void Walk(JToken coordinates, double[] bounds)
        {
            if (!(coordinates is JArray array) || array.Count == 0)
                throw new InvalidDataException("Empty coordinates");
            if (array[0].Type == JTokenType.Integer || array[0].Type == JTokenType.Float)
            {
                if (array.Count < 2 || !TryFinite(array[0], out var x) || !TryFinite(array[1], out var y) ||
                    x < -180 || x > 180 || y < -90 || y > 90)
                    throw new InvalidDataException("Invalid longitude/latitude coordinates");
                bounds[0] = Math.Min(bounds[0], x);
                bounds[1] = Math.Min(bounds[1], y);
                bounds[2] = Math.Max(bounds[2], x);
                bounds[3] = Math.Max(bounds[3], y);
                return;
            }
            foreach (var child in array) Walk(child, bounds);
        }

        private static bool TryFinite(JToken token, out double value)
        {
            value = 0;
            if (token.Type != JTokenType.Integer && token.Type != JTokenType.Float) return false;
            value = token.Value<double>();
            return !double.IsNaN(value) && !double.IsInfinity(value);
        }
    }
}
