import { useState, useEffect } from 'react';
import { Point, InteractionMode } from './types';
import Map from './components/Map';
import { MapPin, Navigation, Plus, Trash2, CheckSquare, Square, LocateFixed, Route, Settings, Cloud, Download, Upload, X, Loader2 } from 'lucide-react';

export default function App() {
  const [lights, setLights] = useState<Point[]>(() => {
    const saved = localStorage.getItem('streetLights');
    return saved ? JSON.parse(saved) : [];
  });
  const [startPoint, setStartPoint] = useState<Point | null>(() => {
    const saved = localStorage.getItem('startPoint');
    return saved ? JSON.parse(saved) : null;
  });
  const [selectedLightIds, setSelectedLightIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<InteractionMode>('none');
  const [routeGeoJSON, setRouteGeoJSON] = useState<any | null>(null);
  const [routeStats, setRouteStats] = useState<{ distance: number, duration: number } | null>(null);
  const [optimizedOrder, setOptimizedOrder] = useState<(Point & { distanceTo?: number })[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([25.0330, 121.5654]); // Default Taipei 101

  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem('sheetUrl') || 'https://script.google.com/macros/s/AKfycbwkSZnKLg3WPlsOk9HVVcyGKafrz4Vzc-KBaMsV1m69_arqq-Hx_uMMfusQ5jlakpSh/exec');
  const [showSettings, setShowSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    localStorage.setItem('sheetUrl', sheetUrl);
  }, [sheetUrl]);

  const fetchFromSheet = async () => {
    if (!sheetUrl) return alert('請先設定 Google Apps Script 網址');
    setIsSyncing(true);
    try {
      const res = await fetch(sheetUrl);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLights(data);
        setSelectedLightIds(new Set());
        alert(`成功從 Google Sheet 載入 ${data.length} 筆資料！`);
      } else {
        throw new Error('Invalid data format');
      }
    } catch (e) {
      console.error(e);
      alert('載入失敗，請確認網址是否正確且已發布為網頁應用程式，並允許所有人存取。');
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToSheet = async () => {
    if (!sheetUrl) return alert('請先設定 Google Apps Script 網址');
    setIsSyncing(true);
    try {
      const res = await fetch(sheetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({ action: 'sync', lights })
      });
      const data = await res.json();
      if (data.success) {
        alert(`成功將 ${lights.length} 筆資料同步至 Google Sheet！`);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (e) {
      console.error(e);
      alert('同步失敗，請確認網址是否正確且已發布為網頁應用程式。');
    } finally {
      setIsSyncing(false);
    }
  };

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('streetLights', JSON.stringify(lights));
  }, [lights]);

  useEffect(() => {
    if (startPoint) {
      localStorage.setItem('startPoint', JSON.stringify(startPoint));
    } else {
      localStorage.removeItem('startPoint');
    }
  }, [startPoint]);

  // Get current location on mount if no start point
  useEffect(() => {
    if (!startPoint && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter([position.coords.latitude, position.coords.longitude]);
        },
        () => {
          console.log("Geolocation not available or denied.");
        }
      );
    } else if (startPoint) {
      setMapCenter([startPoint.lat, startPoint.lng]);
    } else if (lights.length > 0) {
      setMapCenter([lights[0].lat, lights[0].lng]);
    }
  }, []);

  const handleMapClick = (lat: number, lng: number) => {
    if (mode === 'add_light') {
      const newLight: Point = {
        id: crypto.randomUUID(),
        lat,
        lng,
        name: `路燈 ${lights.length + 1}`
      };
      setLights([...lights, newLight]);
      setSelectedLightIds(new Set(selectedLightIds).add(newLight.id));
      setMode('none');
    } else if (mode === 'set_start') {
      setStartPoint({ id: 'start', lat, lng, name: '出發點' });
      setMode('none');
    }
  };

  const toggleLightSelection = (id: string) => {
    const newSelection = new Set(selectedLightIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedLightIds(newSelection);
  };

  const selectAll = () => {
    setSelectedLightIds(new Set(lights.map(l => l.id)));
  };

  const deselectAll = () => {
    setSelectedLightIds(new Set());
  };

  const deleteLight = (id: string) => {
    setLights(lights.filter(l => l.id !== id));
    const newSelection = new Set(selectedLightIds);
    newSelection.delete(id);
    setSelectedLightIds(newSelection);
  };

  const calculateRoute = async () => {
    if (!startPoint) {
      alert("請先設定出發點 (Please set a starting point)");
      return;
    }
    if (selectedLightIds.size === 0) {
      alert("請選擇至少一個路燈 (Please select at least one street light)");
      return;
    }

    setIsCalculating(true);
    try {
      const selectedLights = lights.filter(l => selectedLightIds.has(l.id));

      // OSRM Trip API format: {lng},{lat};{lng},{lat}...
      // First point is start point
      const coordinates = [
        `${startPoint.lng},${startPoint.lat}`,
        ...selectedLights.map(l => `${l.lng},${l.lat}`)
      ].join(';');

      // source=first means the first coordinate is the start point
      // roundtrip=false means we don't need to return to the start
      const url = `https://router.project-osrm.org/trip/v1/driving/${coordinates}?roundtrip=false&source=first&geometries=geojson`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok') {
        throw new Error(data.message || "Failed to calculate route");
      }

      setRouteGeoJSON(data.trips[0].geometry);
      setRouteStats({
        distance: data.trips[0].distance,
        duration: data.trips[0].duration
      });

      // Map waypoints to our points in visited order
      const tripWaypoints = data.waypoints;
      const legs = data.trips[0].legs;

      // we skip index 0 as it is the starting point
      const orderedWithDistances = tripWaypoints.slice(1).map((wp: any, index: number) => {
        // location_index is the index in the original coordinates array
        // coordinates[0] was startPoint
        // coordinates[1...] were selectedLights
        const selectedLights = lights.filter(l => selectedLightIds.has(l.id));
        const lightIndex = wp.location_index - 1;
        return {
          ...selectedLights[lightIndex],
          distanceTo: legs[index].distance // Distance from previous point to this one
        };
      });

      setOptimizedOrder(orderedWithDistances);

    } catch (error) {
      console.error("Routing error:", error);
      alert("無法計算路徑，請稍後再試或確認座標是否在道路附近。");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-96 bg-white shadow-xl flex flex-col z-10 relative">
        <div className="p-6 bg-blue-600 text-white flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="w-6 h-6" />
              路燈編號導航
            </h1>
            <p className="text-blue-100 text-sm mt-1">標示未編號路燈並規劃最短路徑</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-blue-500 rounded-full transition-colors"
            title="Google Sheet 雲端同步設定"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Start Point Section */}
          <section className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <LocateFixed className="w-5 h-5 text-green-600" />
              1. 設定出發點
            </h2>
            {startPoint ? (
              <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-green-200 shadow-sm">
                <div>
                  <div className="font-medium text-green-700">已設定出發點</div>
                  <div className="text-xs text-gray-500">{startPoint.lat.toFixed(5)}, {startPoint.lng.toFixed(5)}</div>
                </div>
                <button
                  onClick={() => setStartPoint(null)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setMode(mode === 'set_start' ? 'none' : 'set_start')}
                className={`w-full py-2 px-4 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center gap-2
                  ${mode === 'set_start'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-300 hover:border-green-400 hover:bg-green-50 text-gray-600'}`}
              >
                <LocateFixed className="w-4 h-4" />
                {mode === 'set_start' ? '請在地圖上點擊位置...' : '在地圖上點擊設定出發點'}
              </button>
            )}
          </section>

          {/* Lights Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                2. 標示路燈
              </h2>
              <button
                onClick={() => setMode(mode === 'add_light' ? 'none' : 'add_light')}
                className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-sm
                  ${mode === 'add_light'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                <Plus className="w-4 h-4" />
                {mode === 'add_light' ? '取消新增' : '新增路燈'}
              </button>
            </div>

            {mode === 'add_light' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 animate-bounce" />
                請在地圖上點擊路燈的實際位置
              </div>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {lights.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                  尚未新增任何路燈
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-xs text-gray-500">共 {lights.length} 個路燈</span>
                    <div className="flex gap-2">
                      <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">全選</button>
                      <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">全不選</button>
                    </div>
                  </div>
                  {lights.map(light => (
                    <div key={light.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg border border-gray-100 group">
                      <button onClick={() => toggleLightSelection(light.id)} className="text-gray-400 hover:text-blue-600">
                        {selectedLightIds.has(light.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-800 truncate">{light.name}</div>
                        <div className="text-xs text-gray-500 truncate">{light.lat.toFixed(5)}, {light.lng.toFixed(5)}</div>
                      </div>
                      <button
                        onClick={() => deleteLight(light.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>

          {/* Route Planning Section */}
          <section className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h2 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Route className="w-5 h-5" />
              3. 規劃最短路徑
            </h2>
            <button
              onClick={calculateRoute}
              disabled={isCalculating || !startPoint || selectedLightIds.size === 0}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {isCalculating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  計算中...
                </>
              ) : (
                <>
                  <Navigation className="w-5 h-5" />
                  開始規劃 ({selectedLightIds.size} 個路燈)
                </>
              )}
            </button>
          </section>

          {/* Optimized Order Result */}
          {optimizedOrder.length > 0 && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-emerald-600" />
                  建議造訪順序
                </h2>
                {routeStats && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 font-medium">
                    總距離: {(routeStats.distance / 1000).toFixed(1)} km •
                    預估時間: {Math.ceil(routeStats.duration / 60)} 分鐘
                  </div>
                )}
              </div>
              <div className="relative pl-4 border-l-2 border-emerald-200 space-y-6">
                {optimizedOrder.map((light, index) => (
                  <div key={light.id} className="relative">
                    <div className="absolute -left-[25px] top-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold ring-4 ring-white">
                      {index + 1}
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="font-bold text-gray-800">{light.name}</div>
                        {light.distanceTo !== undefined && (
                          <div className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">
                            +{light.distanceTo < 1000 ? `${Math.round(light.distanceTo)}m` : `${(light.distanceTo / 1000).toFixed(1)}km`}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{light.lat.toFixed(5)}, {light.lng.toFixed(5)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative">
        <Map
          lights={lights}
          startPoint={startPoint}
          selectedLightIds={selectedLightIds}
          routeGeoJSON={routeGeoJSON}
          mode={mode}
          onMapClick={handleMapClick}
          center={mapCenter}
        />

        {/* Mode Indicator Overlay */}
        {mode !== 'none' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-lg border border-blue-200 text-blue-800 font-medium flex items-center gap-2 animate-bounce pointer-events-none">
            {mode === 'add_light' ? (
              <>
                <MapPin className="w-5 h-5" />
                點擊地圖新增路燈
              </>
            ) : (
              <>
                <LocateFixed className="w-5 h-5 text-green-600" />
                <span className="text-green-700">點擊地圖設定出發點</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-600" />
                Google Sheet 雲端同步設定
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Google Apps Script 網頁應用程式網址 (Web App URL)
                </label>
                <input
                  type="text"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
                <p className="text-xs text-gray-500 mt-2">
                  請將 Apps Script 程式碼貼入您的 Google Sheet，並發布為網頁應用程式後，將網址貼在此處。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <button
                  onClick={fetchFromSheet}
                  disabled={isSyncing || !sheetUrl}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSyncing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Download className="w-6 h-6" />}
                  <span className="font-medium">從雲端下載</span>
                  <span className="text-xs opacity-75 text-center">覆蓋目前的點位</span>
                </button>

                <button
                  onClick={syncToSheet}
                  disabled={isSyncing || !sheetUrl}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSyncing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                  <span className="font-medium">上傳至雲端</span>
                  <span className="text-xs opacity-75 text-center">備份目前的點位</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
