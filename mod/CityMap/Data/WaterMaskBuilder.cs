using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace CityMap.Data
{
    // Carto currently writes uncompressed, single-band, strip-based GeoTIFFs.
    // Reject other TIFF layouts explicitly instead of publishing a wrong mask.
    internal static class WaterMaskBuilder
    {
        internal static Dictionary<string, object> Build(string source, string destination, double[] buildingBounds)
        {
            using (var tiff = new Tiff(source))
            {
                var width = tiff.One(256);
                var height = tiff.One(257);
                var bits = tiff.One(258);
                var sampleFormat = tiff.Optional(339, 1);
                if (width <= 0 || height <= 0 || (long)width * height > 25000000 ||
                    tiff.One(259) != 1 || tiff.One(277) != 1 ||
                    (bits != 16 && bits != 32) || (sampleFormat != 1 && sampleFormat != 2 && sampleFormat != 3) ||
                    (sampleFormat == 3 && bits != 32) || tiff.Optional(284, 1) != 1)
                    throw new InvalidDataException("Unsupported Carto Depth.tif layout");

                var keys = tiff.Shorts(34735);
                var epsg = 0;
                for (var i = 4; i + 3 < keys.Length; i += 4)
                    if (keys[i] == 3072 && keys[i + 1] == 0 && keys[i + 2] == 1)
                        epsg = keys[i + 3];
                var north = epsg >= 32601 && epsg <= 32660;
                var south = epsg >= 32701 && epsg <= 32760;
                if (!north && !south) throw new InvalidDataException("Depth.tif requires WGS84 UTM EPSG:326xx or 327xx");
                var zone = epsg % 100;

                var scale = tiff.Doubles(33550);
                var tie = tiff.Doubles(33922);
                if (scale.Length < 2 || tie.Length != 6 || scale[0] <= 0 || scale[1] <= 0)
                    throw new InvalidDataException("Invalid Depth.tif pixel scale or tie point");
                var noDataText = tiff.Ascii(42113).Trim('\0', ' ');
                if (!double.TryParse(noDataText, NumberStyles.Float, CultureInfo.InvariantCulture, out var noData) ||
                    double.IsNaN(noData) || double.IsInfinity(noData))
                    throw new InvalidDataException("Depth.tif has no finite NoData value");

                var left = tie[3] - tie[0] * scale[0];
                var top = tie[4] + tie[1] * scale[1];
                var right = left + width * scale[0];
                var bottom = top - height * scale[1];
                var coordinates = new[] { InverseUtm(left, top, zone, south),
                    InverseUtm(right, top, zone, south), InverseUtm(right, bottom, zone, south),
                    InverseUtm(left, bottom, zone, south) };
                var bounds = new[] { coordinates.Min(p => p[0]), coordinates.Min(p => p[1]),
                    coordinates.Max(p => p[0]), coordinates.Max(p => p[1]) };
                if (buildingBounds != null && (bounds[2] < buildingBounds[0] || bounds[0] > buildingBounds[2] ||
                    bounds[3] < buildingBounds[1] || bounds[1] > buildingBounds[3]))
                    throw new InvalidDataException("Depth.tif does not overlap building bounds");

                var strips = tiff.Ints(273);
                var sizes = tiff.Ints(279);
                var rowsPerStrip = tiff.One(278);
                if (strips.Length != sizes.Length || rowsPerStrip <= 0 ||
                    strips.Length != (height + rowsPerStrip - 1) / rowsPerStrip)
                    throw new InvalidDataException("Invalid Depth.tif strips");
                var rgba = new byte[checked(width * height * 4)];
                var waterPixels = 0;
                var bytesPerSample = bits / 8;
                for (var strip = 0; strip < strips.Length; strip++)
                {
                    var rows = Math.Min(rowsPerStrip, height - strip * rowsPerStrip);
                    var needed = checked(width * rows * bytesPerSample);
                    var data = tiff.ReadAt(strips[strip], needed);
                    if (sizes[strip] < needed) throw new InvalidDataException("Short Depth.tif strip");
                    for (var i = 0; i < width * rows; i++)
                    {
                        var value = Sample(data, i * bytesPerSample, bits, sampleFormat, tiff.LittleEndian);
                        if (value == noData || value <= 0 || double.IsNaN(value)) continue;
                        var pixel = (strip * rowsPerStrip * width + i) * 4;
                        rgba[pixel] = 166;
                        rgba[pixel + 1] = 208;
                        rgba[pixel + 2] = 221;
                        rgba[pixel + 3] = 255;
                        waterPixels++;
                    }
                }
                if (waterPixels == 0) throw new InvalidDataException("Depth.tif has no water pixels");
                SavePng(destination, width, height, rgba);
                return new Dictionary<string, object>
                {
                    ["file"] = "water-mask.png", ["source"] = "Depth.tif",
                    ["sourceSha256"] = SnapshotBuilder.HashFile(source), ["epsg"] = epsg,
                    ["noData"] = noData, ["width"] = width, ["height"] = height,
                    ["waterPixels"] = waterPixels, ["coordinates"] = coordinates, ["bounds"] = bounds
                };
            }
        }

        private static double Sample(byte[] data, int offset, int bits, int format, bool little)
        {
            if (bits == 16)
            {
                var raw = little ? data[offset] | data[offset + 1] << 8 : data[offset] << 8 | data[offset + 1];
                return format == 2 ? (short)raw : raw;
            }
            var value = little ? BitConverter.ToUInt32(data, offset) :
                (uint)(data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]);
            return format == 3 ? BitConverter.ToSingle(BitConverter.GetBytes(value), 0) :
                format == 2 ? (int)value : value;
        }

        private static void SavePng(string path, int width, int height, byte[] rgba)
        {
            using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                var rect = new Rectangle(0, 0, width, height);
                var bits = bitmap.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                try
                {
                    var bgra = new byte[rgba.Length];
                    for (var i = 0; i < rgba.Length; i += 4)
                    {
                        bgra[i] = rgba[i + 2]; bgra[i + 1] = rgba[i + 1];
                        bgra[i + 2] = rgba[i]; bgra[i + 3] = rgba[i + 3];
                    }
                    Marshal.Copy(bgra, 0, bits.Scan0, bgra.Length);
                }
                finally { bitmap.UnlockBits(bits); }
                bitmap.Save(path, ImageFormat.Png);
            }
        }

        // WGS84 inverse Transverse Mercator, matching proj4's UTM output to sub-meter precision.
        private static double[] InverseUtm(double easting, double northing, int zone, bool south)
        {
            const double a = 6378137, f = 1 / 298.257223563, k = 0.9996;
            var e2 = f * (2 - f);
            var ep2 = e2 / (1 - e2);
            var x = easting - 500000;
            var y = south ? northing - 10000000 : northing;
            var m = y / k;
            var mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
            var e1 = (1 - Math.Sqrt(1 - e2)) / (1 + Math.Sqrt(1 - e2));
            var phi = mu + (3 * e1 / 2 - 27 * Math.Pow(e1, 3) / 32) * Math.Sin(2 * mu) +
                (21 * e1 * e1 / 16 - 55 * Math.Pow(e1, 4) / 32) * Math.Sin(4 * mu) +
                151 * Math.Pow(e1, 3) / 96 * Math.Sin(6 * mu) + 1097 * Math.Pow(e1, 4) / 512 * Math.Sin(8 * mu);
            var s = Math.Sin(phi); var c = Math.Cos(phi); var t = Math.Tan(phi);
            var n = a / Math.Sqrt(1 - e2 * s * s);
            var r = a * (1 - e2) / Math.Pow(1 - e2 * s * s, 1.5);
            var d = x / (n * k);
            var latitude = phi - n * t / r * (d * d / 2 - (5 + 3 * t * t + 10 * ep2 * c * c -
                4 * ep2 * ep2 * c * c * c * c - 9 * ep2) * Math.Pow(d, 4) / 24 +
                (61 + 90 * t * t + 298 * ep2 * c * c + 45 * Math.Pow(t, 4) -
                252 * ep2 - 3 * ep2 * ep2 * c * c * c * c) * Math.Pow(d, 6) / 720);
            var longitude = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180 +
                (d - (1 + 2 * t * t + ep2 * c * c) * Math.Pow(d, 3) / 6 +
                (5 - 2 * ep2 * c * c + 28 * t * t - 3 * ep2 * ep2 * c * c * c * c +
                8 * ep2 + 24 * Math.Pow(t, 4)) * Math.Pow(d, 5) / 120) / c;
            return new[] { longitude * 180 / Math.PI, latitude * 180 / Math.PI };
        }

        private sealed class Tiff : IDisposable
        {
            private readonly FileStream _stream;
            private readonly Dictionary<int, Tag> _tags = new Dictionary<int, Tag>();
            internal bool LittleEndian { get; }
            internal Tiff(string path)
            {
                _stream = File.OpenRead(path);
                var endian = ReadAt(0, 2);
                LittleEndian = endian[0] == 'I' && endian[1] == 'I';
                if (!LittleEndian && !(endian[0] == 'M' && endian[1] == 'M'))
                    throw new InvalidDataException("Invalid TIFF byte order");
                if (U16(ReadAt(2, 2), 0) != 42) throw new InvalidDataException("BigTIFF is unsupported");
                var ifd = U32(ReadAt(4, 4), 0);
                var count = U16(ReadAt(ifd, 2), 0);
                if (count > 1024) throw new InvalidDataException("Invalid TIFF tag count");
                var entries = ReadAt(ifd + 2, count * 12);
                for (var i = 0; i < count; i++)
                {
                    var p = i * 12;
                    _tags[U16(entries, p)] = new Tag { Type = U16(entries, p + 2),
                        Count = U32(entries, p + 4), Inline = entries.Skip(p + 8).Take(4).ToArray() };
                }
            }
            internal byte[] ReadAt(long offset, int count)
            {
                if (offset < 0 || count < 0 || offset + count > _stream.Length)
                    throw new InvalidDataException("TIFF offset outside file");
                _stream.Position = offset;
                var bytes = new byte[count];
                var read = 0;
                while (read < count) { var n = _stream.Read(bytes, read, count - read); if (n == 0) break; read += n; }
                if (read != count) throw new InvalidDataException("Truncated TIFF");
                return bytes;
            }
            private byte[] Data(int key)
            {
                if (!_tags.TryGetValue(key, out var tag)) throw new InvalidDataException("Missing TIFF tag " + key);
                var size = tag.Type == 3 ? 2 : tag.Type == 4 ? 4 : tag.Type == 12 ? 8 : 1;
                var length = checked((int)tag.Count * size);
                return length <= 4 ? tag.Inline.Take(length).ToArray() : ReadAt(U32(tag.Inline, 0), length);
            }
            internal int One(int key) => Ints(key).Single();
            internal int Optional(int key, int fallback) => _tags.ContainsKey(key) ? One(key) : fallback;
            internal int[] Ints(int key)
            {
                var tag = _tags[key]; var data = Data(key);
                if (tag.Type != 3 && tag.Type != 4) throw new InvalidDataException("Invalid TIFF integer tag " + key);
                var size = tag.Type == 3 ? 2 : 4;
                return Enumerable.Range(0, checked((int)tag.Count)).Select(i =>
                    checked((int)(size == 2 ? (uint)U16(data, i * size) : U32(data, i * size)))).ToArray();
            }
            internal int[] Shorts(int key) => Ints(key);
            internal double[] Doubles(int key)
            {
                var tag = _tags[key]; var data = Data(key);
                if (tag.Type != 12) throw new InvalidDataException("Invalid TIFF double tag " + key);
                return Enumerable.Range(0, checked((int)tag.Count)).Select(i =>
                {
                    var eight = data.Skip(i * 8).Take(8).ToArray();
                    if (LittleEndian != BitConverter.IsLittleEndian) Array.Reverse(eight);
                    return BitConverter.ToDouble(eight, 0);
                }).ToArray();
            }
            internal string Ascii(int key) => System.Text.Encoding.ASCII.GetString(Data(key));
            private int U16(byte[] b, int i) => LittleEndian ? b[i] | b[i + 1] << 8 : b[i] << 8 | b[i + 1];
            private uint U32(byte[] b, int i) => LittleEndian ? (uint)(b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) :
                (uint)(b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]);
            public void Dispose() => _stream.Dispose();
            private sealed class Tag { internal int Type; internal uint Count; internal byte[] Inline; }
        }
    }
}
