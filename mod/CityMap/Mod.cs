using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using CityMap.Data;
using CityMap.Export;
using CityMap.Hosting;
using CityMap.UI;
using Colossal.Logging;
using Game;
using Game.Modding;
using Game.SceneFlow;
using UnityEngine;

namespace CityMap
{
    public sealed class Mod : IMod
    {
        internal static readonly ILog Log = LogManager.GetLogger("CityMap.Mod").SetShowsErrorsInUI(false);
        internal static Mod Current { get; private set; }
        private CityMapSetting _setting;
        private CartoAdapter _carto;
        private bool _exporting;
        private LocalMapServer _server;
        private bool _disposed;
        private bool _wasPlayable;
        private bool _exportRequested;
        private DateTime _exportDueUtc;
        private int _cityGeneration;
        private int _jobSequence;
        private int _activeJob;
        private Task _housekeeping;
        private CancellationTokenSource _jobCancellation;
        private string _currentUrl;
        private string _currentSnapshot;
        internal string Phase { get; private set; } = "idle";
        internal string Message { get; private set; } = "Load a city to export its map.";
        internal bool CanReopen => _wasPlayable && !_exporting && _currentUrl != null;

        private static string FindWebRoot()
        {
            var candidates = new List<string>();
            var local = Path.Combine(Application.persistentDataPath, "Mods", "CityMap", "web");
            if (File.Exists(Path.Combine(local, "index.html"))) return local;
            candidates.Add(local);
            var assembly = typeof(Mod).Assembly;
            foreach (var codeBase in new[] { false, true })
            {
                try
                {
                    var location = codeBase ? assembly.CodeBase : assembly.Location;
                    if (string.IsNullOrEmpty(location)) continue;
                    var path = Uri.TryCreate(location, UriKind.Absolute, out var uri) && uri.IsFile ?
                        uri.LocalPath : location;
                    var directory = Path.GetDirectoryName(path);
                    if (string.IsNullOrEmpty(directory)) continue;
                    candidates.Add(Path.Combine(directory, "web"));
                }
                catch (Exception ex) when (ex is ArgumentException || ex is NotSupportedException) { }
            }
            foreach (var candidate in candidates)
            {
                if (File.Exists(Path.Combine(candidate, "index.html"))) return candidate;
            }
            // Unity can load subscribed code mods without a usable Assembly.Location.
            // Paradox Mods keeps this mod's files in a versioned cache directory.
            var modCache = Path.Combine(Application.persistentDataPath, ".cache", "Mods");
            foreach (var cacheName in new[] { "pdx_mods", "mods_subscribed" })
            {
                var cacheRoot = Path.Combine(modCache, cacheName);
                candidates.Add(Path.Combine(cacheRoot, "160718_*", "web"));
                if (!Directory.Exists(cacheRoot)) continue;
                try
                {
                    foreach (var modDirectory in Directory.GetDirectories(cacheRoot, "160718_*"))
                    {
                        var dll = Path.Combine(modDirectory, "CityMap.dll");
                        var web = Path.Combine(modDirectory, "web");
                        if (!File.Exists(dll) || !File.Exists(Path.Combine(web, "index.html"))) continue;
                        if (!AssemblyName.GetAssemblyName(dll).Version.Equals(assembly.GetName().Version)) continue;
                        return web;
                    }
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
            throw new FileNotFoundException("City Map web app was not found. Checked: " + string.Join("; ", candidates));
        }

        public void OnLoad(UpdateSystem updateSystem)
        {
            Current = this;
            _carto = new CartoAdapter();
            _setting = new CityMapSetting(this);
            _setting.RegisterInOptionsUI();
            GameManager.instance.localizationManager.AddSource("en-US", new CityMapLocale(_setting));
            updateSystem.UpdateAt<CityMapUISystem>(SystemUpdatePhase.UIUpdate);
            var dataRoot = Path.Combine(Application.persistentDataPath, "ModsData", "CityMap");
            _housekeeping = Task.Run(() =>
            {
                try { SnapshotStore.Cleanup(dataRoot); }
                catch (Exception ex) { Log.Warn("Snapshot cleanup failed: " + ex); }
            });
            Log.Info("CityMap loaded; Carto export is available from Options after loading a city.");
        }

        public void OnDispose()
        {
            _disposed = true;
            _cityGeneration++;
            _jobCancellation?.Cancel();
            _exportRequested = false;
            Current = null;
            _server?.Dispose();
            _server = null;
            if (_setting != null)
            {
                _setting.UnregisterInOptionsUI();
                _setting = null;
            }
            _carto = null;
            Log.Info("CityMap disposed.");
        }

        internal void RequestExport()
        {
            if (_disposed) return;
            if (GameManager.instance == null || GameManager.instance.gameMode != GameMode.Game ||
                GameManager.instance.isGameLoading)
            {
                SetState("idle", "Load a city before exporting.");
                return;
            }
            if (_exporting || _exportRequested) return;
            _exportRequested = true;
            // Let the Options screen render the loading state before Carto's
            // synchronous game-thread export begins.
            _exportDueUtc = DateTime.UtcNow.AddMilliseconds(250);
            SetState("queued", "Starting map export...");
        }

        internal void Tick(bool playable)
        {
            if (_disposed) return;
            if (_wasPlayable && !playable)
            {
                _cityGeneration++;
                _jobCancellation?.Cancel();
                _activeJob = 0;
                _exporting = false;
                _currentUrl = null;
                _currentSnapshot = null;
                _server?.ClearCurrent();
                SetState("idle", "Load a city to export its map.");
            }
            else if (!_wasPlayable && playable && !_exporting && _currentUrl == null)
                SetState("idle", "Ready to export the current city.");
            _wasPlayable = playable;
            if (!playable)
            {
                _exportRequested = false;
                return;
            }
            if (_exportRequested && DateTime.UtcNow >= _exportDueUtc)
            {
                _exportRequested = false;
                ExportCurrentCity();
            }
        }

        private void SetState(string phase, string message)
        {
            Phase = phase;
            Message = message;
            _setting?.SetStatus(message,
                phase == "queued" || phase == "exporting" || phase == "preparing");
        }

        internal void ExportCurrentCity()
        {
            if (_disposed || GameManager.instance == null ||
                GameManager.instance.gameMode != GameMode.Game || GameManager.instance.isGameLoading)
            {
                SetState("idle", "Load a city before exporting.");
                return;
            }
            if (_exporting)
            {
                SetState("preparing", "A snapshot is already in progress.");
                return;
            }
            _wasPlayable = true;

            // The settings callback runs on the game thread. Carto accesses ECS here, so do
            // not send the export to Task.Run.
            _exporting = true;
            var job = _activeJob = ++_jobSequence;
            _jobCancellation = new CancellationTokenSource();
            var cancellation = _jobCancellation.Token;
            SetState("exporting", "Exporting the current city through Carto...");
            var generation = _cityGeneration;
            string path = null;
            try
            {
                var root = Path.Combine(Application.persistentDataPath, "ModsData", "CityMap");
                var styles = Path.Combine(Application.persistentDataPath, "ModsData", "Carto", "Styles");
                path = Path.Combine(root, "staging", Guid.NewGuid().ToString("N"));
                _carto.Export(path);
                if (_disposed || generation != _cityGeneration)
                {
                    _exporting = false;
                    DeleteStaging(path);
                    return;
                }
                SetState("preparing", "Preparing and checking map data...");
                var context = SynchronizationContext.Current;
                if (context == null)
                {
                    SnapshotResult result = null;
                    Exception error = null;
                    try
                    {
                        _housekeeping?.Wait();
                        result = SnapshotBuilder.Prepare(path, Path.Combine(root, "snapshots"), styles, cancellation);
                    }
                    catch (Exception ex) { error = ex; }
                    finally { DeleteStaging(path); }
                    FinishSnapshot(result, error, generation, job);
                    return;
                }
                var stagingPath = path;
                Task.Run(() =>
                {
                    try
                    {
                        _housekeeping?.Wait();
                        return SnapshotBuilder.Prepare(stagingPath, Path.Combine(root, "snapshots"), styles, cancellation);
                    }
                    finally { DeleteStaging(stagingPath); }
                }).ContinueWith(task => context.Post(_ =>
                    FinishSnapshot(task.Status == TaskStatus.RanToCompletion ? task.Result : null,
                        task.IsFaulted ? task.Exception.GetBaseException() :
                        task.IsCanceled ? new OperationCanceledException("Snapshot preparation was cancelled.") : null,
                        generation, job), null));
            }
            catch (Exception ex)
            {
                _exporting = false;
                _activeJob = 0;
                _jobCancellation?.Cancel();
                if (path != null) DeleteStaging(path);
                SetState("error", "Export failed: " + ex.Message);
                Log.Error(ex.ToString());
            }
        }

        private static void DeleteStaging(string path)
        {
            try { if (Directory.Exists(path)) Directory.Delete(path, true); }
            catch (Exception ex) { Log.Warn("Could not remove staging folder: " + ex.Message); }
        }

        private void FinishSnapshot(SnapshotResult snapshot, Exception error, int generation, int job)
        {
            if (_disposed || generation != _cityGeneration || job != _activeJob || !_wasPlayable) return;
            _exporting = false;
            _activeJob = 0;
            _jobCancellation = null;
            if (error != null)
            {
                SetState("error", "Snapshot failed: " + error.Message);
                Log.Error(error.ToString());
                return;
            }
            try
            {
                if (_server == null)
                    _server = new LocalMapServer(FindWebRoot());
                _currentUrl = _server.Publish(snapshot.Path);
                _currentSnapshot = Path.GetFileName(snapshot.Path);
                SetState("ready", "Map ready: " + _currentSnapshot +
                    (snapshot.Warnings > 0 ? " (" + snapshot.Warnings + " optional output warnings)" : ""));
                Log.Info("CityMap snapshot ready: " + snapshot.Path);
                OpenBrowser();
            }
            catch (Exception ex)
            {
                SetState("error", _currentUrl == null ?
                    "Snapshot ready, but the map server could not start: " + ex.Message :
                    "Browser did not open. Use Reopen map or open: " + _currentUrl);
                Log.Error("CityMap browser/server failed (" + ex.GetType().Name + ").");
            }
        }

        internal void ReopenMap()
        {
            if (!CanReopen)
            {
                SetState("idle", "Export this city before reopening its map.");
                return;
            }
            try { OpenBrowser(); SetState("ready", "Map ready: " + _currentSnapshot); }
            catch (Exception ex)
            {
                SetState("error", "Browser did not open. Open: " + _currentUrl);
                Log.Error("CityMap browser launch failed (" + ex.GetType().Name + ").");
            }
        }

        private void OpenBrowser() => Process.Start(new ProcessStartInfo(_currentUrl) { UseShellExecute = true });
    }
}
