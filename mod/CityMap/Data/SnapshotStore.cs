using System;
using System.IO;
using System.Linq;

namespace CityMap.Data
{
    internal static class SnapshotStore
    {
        // Housekeeping runs once on load. The server's snapshots from this session
        // are never candidates, so a browser tab cannot lose its backing files.
        private const int KeepSnapshots = 10;
        private const long KeepBytes = 5L * 1024 * 1024 * 1024;

        internal static void Cleanup(string root)
        {
            var cutoff = DateTime.UtcNow.AddDays(-1);
            RemoveOldDirectories(Path.Combine(root, "staging"), cutoff, null);
            var snapshots = Path.Combine(root, "snapshots");
            RemoveOldDirectories(snapshots, cutoff, ".pending-");
            if (!Directory.Exists(snapshots)) return;
            foreach (var path in Directory.GetDirectories(snapshots))
            {
                var name = Path.GetFileName(path);
                if (name.Length != 16 || name.Any(c => !"0123456789abcdef".Contains(c)) ||
                    File.Exists(Path.Combine(path, "manifest.json"))) continue;
                try
                {
                    if (Directory.GetLastWriteTimeUtc(path) < cutoff) Directory.Delete(path, true);
                }
                catch (Exception ex) { Mod.Log.Warn("Incomplete snapshot cleanup skipped " + path + ": " + ex.Message); }
            }

            var completed = Directory.GetDirectories(snapshots)
                .Where(path => File.Exists(Path.Combine(path, "manifest.json")))
                .OrderByDescending(path => File.GetLastWriteTimeUtc(Path.Combine(path, "manifest.json")))
                .ToArray();
            long retainedBytes = 0;
            for (var index = 0; index < completed.Length; index++)
            {
                var path = completed[index];
                try
                {
                    var bytes = Directory.GetFiles(path, "*", SearchOption.AllDirectories)
                        .Sum(file => new FileInfo(file).Length);
                    if (index == 0 || (index < KeepSnapshots && retainedBytes + bytes <= KeepBytes))
                    {
                        retainedBytes += bytes;
                        continue;
                    }
                    Directory.Delete(path, true);
                }
                catch (Exception ex) { Mod.Log.Warn("Snapshot cleanup skipped " + path + ": " + ex.Message); }
            }
        }

        private static void RemoveOldDirectories(string root, DateTime cutoff, string prefix)
        {
            if (!Directory.Exists(root)) return;
            foreach (var path in Directory.GetDirectories(root))
            {
                if (prefix != null && !Path.GetFileName(path).StartsWith(prefix, StringComparison.Ordinal))
                    continue;
                try
                {
                    if (Directory.GetLastWriteTimeUtc(path) < cutoff) Directory.Delete(path, true);
                }
                catch (Exception ex) { Mod.Log.Warn("Temporary folder cleanup skipped " + path + ": " + ex.Message); }
            }
        }
    }
}
