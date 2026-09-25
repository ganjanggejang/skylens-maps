using System;
using System.Collections.Generic;
using Colossal;
using Colossal.IO.AssetDatabase;
using Game.Modding;
using Game.Settings;

namespace CityMap
{
    [FileLocation(nameof(CityMap))]
    public sealed class CityMapSetting : ModSetting
    {
        internal const string Section = "Main";
        internal const string Group = "Export";
        private readonly Mod _mod;
        private string _status = "Ready";
        private bool _busy;
        private static readonly string[] Spinner = { "\u25D0", "\u25D3", "\u25D1", "\u25D2" };

        public CityMapSetting(Mod mod) : base(mod) { _mod = mod; }

        [SettingsUIButton]
        [SettingsUISection(Section, Group)]
        public bool ExportButton { set { _mod.RequestExport(); } }

        [SettingsUIButton]
        [SettingsUISection(Section, Group)]
        public bool ReopenButton { set { _mod.ReopenMap(); } }

        [SettingsUISection(Section, Group)]
        public string Status => _busy
            ? Spinner[(Environment.TickCount & int.MaxValue) / 160 % Spinner.Length] + " " + _status
            : _status;

        internal void SetStatus(string value, bool busy) { _status = value; _busy = busy; }

        public override void SetDefaults() { _status = "Ready"; _busy = false; }
    }

    public sealed class CityMapLocale : IDictionarySource
    {
        private readonly CityMapSetting _setting;
        public CityMapLocale(CityMapSetting setting) { _setting = setting; }

        public IEnumerable<KeyValuePair<string, string>> ReadEntries(
            IList<IDictionaryEntryError> errors, Dictionary<string, int> indexCounts)
        {
            return new Dictionary<string, string>
            {
                { _setting.GetSettingsLocaleID(), "SKYLENS MAPS" },
                { _setting.GetOptionTabLocaleID(CityMapSetting.Section), "Main" },
                { _setting.GetOptionGroupLocaleID(CityMapSetting.Group), "Export" },
                { _setting.GetOptionLabelLocaleID(nameof(CityMapSetting.ExportButton)), "LAUNCH SKYLENS MAPS" },
                { _setting.GetOptionDescLocaleID(nameof(CityMapSetting.ExportButton)), "Export the current city and open Skylens Maps in your browser." },
                { _setting.GetOptionLabelLocaleID(nameof(CityMapSetting.ReopenButton)), "Reopen map" },
                { _setting.GetOptionDescLocaleID(nameof(CityMapSetting.ReopenButton)), "Open the latest map for the loaded city without exporting again." },
                { _setting.GetOptionLabelLocaleID(nameof(CityMapSetting.Status)), "Status" }
            };
        }

        public void Unload() { }
    }
}
