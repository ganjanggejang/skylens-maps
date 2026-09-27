using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace CityMap.Hosting
{
    // Serves one completed snapshot and the packaged web app for this game session.
    internal sealed class LocalMapServer : IDisposable
    {
        private static readonly Regex SnapshotId = new Regex("^[0-9a-f]{16}$", RegexOptions.Compiled);
        private static readonly string[] GeoJsonFiles = {
            "Building_Boundary.json", "Network_Centerline.json", "Area_Boundary.json",
            "POI_Location.json", "Route_Centerline.json", "Zoning_Boundary.json",
            "Network_Boundary.json"
        };

        private readonly string _webRoot;
        private readonly HttpListener _listener = new HttpListener();
        private readonly string _token;
        private readonly int _port;
        private readonly ConcurrentDictionary<string, string> _published =
            new ConcurrentDictionary<string, string>(StringComparer.Ordinal);
        private string _snapshotId;
        private bool _disposed;

        internal LocalMapServer(string webRoot)
        {
            _webRoot = Path.GetFullPath(webRoot);
            if (!File.Exists(Path.Combine(_webRoot, "index.html")))
                throw new FileNotFoundException("Packaged City Map web app is missing.", Path.Combine(_webRoot, "index.html"));
            var tokenBytes = new byte[24];
            using (var random = RandomNumberGenerator.Create()) random.GetBytes(tokenBytes);
            _token = BitConverter.ToString(tokenBytes).Replace("-", "").ToLowerInvariant();
            // Another process can take the probed port before HttpListener starts.
            for (var attempt = 0; ; attempt++)
            {
                var reservation = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
                reservation.Start();
                _port = ((IPEndPoint)reservation.LocalEndpoint).Port;
                reservation.Stop();
                _listener.Prefixes.Clear();
                _listener.Prefixes.Add("http://127.0.0.1:" + _port + "/");
                try { _listener.Start(); break; }
                catch (HttpListenerException) when (attempt < 9) { }
            }
            _ = Listen();
        }

        internal string Publish(string path)
        {
            if (_disposed) throw new ObjectDisposedException(nameof(LocalMapServer));
            var id = Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar));
            if (!SnapshotId.IsMatch(id) || !File.Exists(Path.Combine(path, "manifest.json")))
                throw new InvalidDataException("Snapshot has no completion marker.");
            _published[id] = Path.GetFullPath(path);
            Volatile.Write(ref _snapshotId, id);
            return "http://127.0.0.1:" + _port + "/s/" + _token + "/";
        }

        internal void ClearCurrent() => Volatile.Write(ref _snapshotId, null);

        private async Task Listen()
        {
            while (!_disposed)
            {
                HttpListenerContext context;
                try { context = await _listener.GetContextAsync(); }
                catch (Exception ex) when (ex is HttpListenerException || ex is ObjectDisposedException) { break; }
                _ = Task.Run(() => Respond(context));
            }
        }

        private void Respond(HttpListenerContext context)
        {
            var response = context.Response;
            try
            {
                response.Headers["Cache-Control"] = "no-store";
                response.Headers["Referrer-Policy"] = "no-referrer";
                response.Headers["X-Content-Type-Options"] = "nosniff";
                response.Headers["X-Frame-Options"] = "DENY";
                response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
                var origin = "http://127.0.0.1:" + _port;
                var requestOrigin = context.Request.Headers["Origin"];
                var fetchSite = context.Request.Headers["Sec-Fetch-Site"];
                if (!IPAddress.IsLoopback(context.Request.RemoteEndPoint.Address) ||
                    context.Request.Headers["Host"] != "127.0.0.1:" + _port ||
                    (requestOrigin != null && requestOrigin != origin) ||
                    (fetchSite != null && fetchSite != "same-origin" && fetchSite != "none") ||
                    context.Request.HttpMethod != "GET") { Reject(response, 403); return; }
                var prefix = "/s/" + _token + "/";
                var path = context.Request.Url.AbsolutePath;
                if (!path.StartsWith(prefix, StringComparison.Ordinal)) { Reject(response, 404); return; }
                var relative = path.Substring(prefix.Length);
                if (relative.Length == 0) relative = "index.html";
                if (relative == "session.json")
                {
                    var id = Volatile.Read(ref _snapshotId);
                    if (id == null) { Reject(response, 503); return; }
                    Send(response, Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(new
                    {
                        snapshotId = id,
                        dataRoot = "snapshots/" + id + "/"
                    })), "application/json; charset=utf-8");
                    return;
                }
                string file;
                if (relative.StartsWith("snapshots/", StringComparison.Ordinal))
                {
                    var parts = relative.Split('/');
                    if (parts.Length < 3 || !SnapshotId.IsMatch(parts[1]) ||
                        !_published.TryGetValue(parts[1], out var snapshot))
                    { Reject(response, 404); return; }
                    if (parts.Length == 3 && parts[2] == "manifest.json")
                        file = Path.Combine(snapshot, "manifest.json");
                    else if (parts.Length == 3 && parts[2] == "water-mask.png")
                        file = Path.Combine(snapshot, "water-mask.png");
                    else if (parts.Length == 4 && parts[2] == "GeoJSON" &&
                        Array.IndexOf(GeoJsonFiles, parts[3]) >= 0)
                        file = Path.Combine(snapshot, "GeoJSON", parts[3]);
                    else { Reject(response, 404); return; }
                }
                else
                {
                    // Vite emits index.html and hashed assets. Each segment must be a plain filename.
                    var parts = relative.Split('/');
                    if (parts.Length > 2 || (parts.Length == 2 && parts[0] != "assets") ||
                        Array.Exists(parts, part => part.Length == 0 || part == "." || part == ".." ||
                            part.IndexOfAny(new[] { '\\', ':', '%' }) >= 0))
                    { Reject(response, 404); return; }
                    file = Path.Combine(_webRoot, relative.Replace('/', Path.DirectorySeparatorChar));
                }
                if (!File.Exists(file)) { Reject(response, 404); return; }
                var mime = Mime(file);
                if (mime == null) { Reject(response, 404); return; }
                response.ContentType = mime;
                using (var input = File.OpenRead(file))
                {
                    response.ContentLength64 = input.Length;
                    input.CopyTo(response.OutputStream);
                }
            }
            catch (Exception ex)
            {
                Mod.Log.Error("CityMap HTTP response failed: " + ex);
            }
            finally { try { response.Close(); } catch { } }
        }

        private static string Mime(string file)
        {
            switch (Path.GetExtension(file).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".png": return "image/png";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                case ".woff": case ".woff2": return "font/woff2";
                default: return null;
            }
        }

        private static void Send(HttpListenerResponse response, byte[] data, string mime)
        {
            response.ContentType = mime;
            response.ContentLength64 = data.Length;
            response.OutputStream.Write(data, 0, data.Length);
        }

        private static void Reject(HttpListenerResponse response, int code)
        {
            response.StatusCode = code;
            response.ContentLength64 = 0;
        }

        public void Dispose()
        {
            _disposed = true;
            _listener.Close();
            _published.Clear();
        }
    }
}
