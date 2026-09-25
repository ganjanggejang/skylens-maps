using Game;
using Game.SceneFlow;
using Game.UI;
using UnityEngine.Scripting;

namespace CityMap.UI
{
    public sealed partial class CityMapUISystem : UISystemBase
    {
        public override GameMode gameMode => GameMode.All;

        [Preserve]
        protected override void OnCreate()
        {
            base.OnCreate();
            Mod.Log.Info("CityMap lifecycle system created.");
        }

        [Preserve]
        protected override void OnUpdate()
        {
            base.OnUpdate();
            var mod = Mod.Current;
            if (mod == null) return;
            var manager = GameManager.instance;
            mod.Tick(manager != null && manager.gameMode == GameMode.Game && !manager.isGameLoading);
        }

        [Preserve]
        public CityMapUISystem() { }
    }
}
