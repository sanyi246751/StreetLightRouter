import { useState, useEffect } from 'react';
import { Point, InteractionMode } from './types';
import Map from './components/Map';
import { MapPin, Navigation, Plus, Trash2, CheckSquare, Square, LocateFixed, Route, Settings, Cloud, Download, Upload, X, Loader2, Menu, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [heading, setHeading] = useState(0);
  const [routeSegments, setRouteSegments] = useState<{ geometry: any, color: string }[]>([]);
  const [routeStats, setRouteStats] = useState<{ distance: number, duration: number } | null>(null);
  const [optimizedOrder, setOptimizedOrder] = useState<(Point & { distanceTo?: number, durationTo?: number, color?: string })[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([25.0330, 121.5654]); // Default Taipei 101

  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem('sheetUrl') || 'https://script.google.com/macros/s/AKfycbwkSZnKLg3WPlsOk9HVVcyGKafrz4Vzc-KBaMsV1m69_arqq-Hx_uMMfusQ5jlakpSh/exec');
  const [syncPassword, setSyncPassword] = useState(() => localStorage.getItem('syncPassword') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(window.innerWidth > 768);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setShowSidebar(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('sheetUrl', sheetUrl);
    localStorage.setItem('syncPassword', syncPassword);
  }, [sheetUrl, syncPassword]);

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

    const confirmSync = window.confirm(`將上傳 ${lights.length} 筆路燈資料，這會覆蓋雲端現有的點位，確定要繼續嗎？`);
    if (!confirmSync) return;

    if (syncPassword) {
      const inputPass = window.prompt('請輸入上傳密碼：');
      if (inputPass !== syncPassword) {
        alert('密碼錯誤，上傳取消。');
        return;
      }
    }

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

  // Distance helper (Haversine)
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in metres
  };

  // Distance from point to polyline
  const checkDeviation = (lat: number, lng: number) => {
    if (routeSegments.length === 0) return false;

    // Simple check: is the user within 50m of ANY point in the planned route?
    let minDistance = Infinity;
    for (const seg of routeSegments) {
      for (const coord of seg.geometry.coordinates) {
        const d = getDistance(lat, lng, coord[1], coord[0]);
        if (d < minDistance) minDistance = d;
      }
    }
    return minDistance > 60; // 60 meters threshold
  };

  // Handle Navigation and Geolocation Watching
  const requestOrientationPermission = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        return response === 'granted';
      } catch (e) {
        console.error(e);
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    let watchId: number | null = null;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const alpha = (e as any).webkitCompassHeading || e.alpha;
      if (alpha !== null) {
        // Simple smoothing (Alpha filter: 0.1 means 10% new value, 90% old)
        setHeading(prev => {
          const diff = alpha - prev;
          // Handle wrap-around (0<->360)
          const normalizedDiff = ((diff + 180) % 360) - 180;
          const smoothed = prev + normalizedDiff * 0.2;

          setStartPoint(sp => sp ? { ...sp, heading: smoothed } : null);
          return smoothed;
        });
      }
    };

    if (mode === 'navigating') {
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, heading: gpsHeading, accuracy } = position.coords;

            // Only update if accuracy is decent or significant move
            setStartPoint(prev => {
              if (prev && prev.lat && prev.lng) {
                const dist = getDistance(latitude, longitude, prev.lat, prev.lng);
                // Threshold: Only update if moved more than 2 meters (reducing jitter)
                if (dist < 2) return prev;
              }

              const newPoint = {
                ...prev || { id: 'start-gps', name: '目前位置 (GPS)', lat: 0, lng: 0 },
                lat: latitude,
                lng: longitude,
                heading: gpsHeading || heading
              };

              // Map centering logic: only center if the move is significant (> 5m)
              // This prevents the screen from 'shaking' with every minor GPS jitter
              setMapCenter(prevCenter => {
                const dCenter = getDistance(latitude, longitude, prevCenter[0], prevCenter[1]);
                return dCenter > 5 ? [latitude, longitude] : prevCenter;
              });

              return newPoint;
            });

            // Auto-reroute if deviated (Keep same threshold, but based on smoothed point)
            if (!isCalculating && checkDeviation(latitude, longitude)) {
              calculateRouteFromPoint(latitude, longitude);
            }
          },
          (err) => console.error("WatchPosition error:", err),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
        );
      }

      if ('DeviceOrientationEvent' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientation as any);
        window.addEventListener('deviceorientation', handleOrientation as any);
      }
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any);
      window.removeEventListener('deviceorientation', handleOrientation as any);
    };
  }, [mode, routeSegments, isCalculating]);

  const calculateRouteFromPoint = async (lat: number, lng: number) => {
    if (selectedLightIds.size === 0) return;
    setIsCalculating(true);
    try {
      // Find which lights are not visited? Actually OSRM trip handles all.
      // But we might want to exclude lights we just passed? For now keep it simple.
      const sLights = lights.filter(l => selectedLightIds.has(l.id));
      const coords = [`${lng},${lat}`, ...sLights.map(l => `${l.lng},${l.lat}`)].join(';');
      const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=first&geometries=geojson&steps=true&overview=full`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== 'Ok') throw new Error(data.message || data.code);

      const trip = data.trips[0];
      const waypointsWithOriginalIndex = data.waypoints.map((wp: any, idx: number) => ({ ...wp, originalInputIndex: idx }));
      const sortedWps = [...waypointsWithOriginalIndex].sort((a, b) => a.waypoint_index - b.waypoint_index);
      const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];

      const segs = trip.legs.map((leg: any, idx: number) => ({
        geometry: { type: "LineString", coordinates: leg.steps ? leg.steps.flatMap((s: any) => s.geometry.coordinates) : [] },
        color: colors[idx % colors.length]
      })).filter((s: any) => s.geometry.coordinates.length > 0);

      const results = [];
      for (let i = 1; i < sortedWps.length; i++) {
        const wp = sortedWps[i];
        const sLightIndex = wp.originalInputIndex - 1;
        const pt = sLights[sLightIndex];
        if (pt) {
          results.push({
            ...pt,
            distanceTo: trip.legs[i - 1] ? trip.legs[i - 1].distance : 0,
            durationTo: trip.legs[i - 1] ? trip.legs[i - 1].duration : 0,
            color: colors[(i - 1) % colors.length]
          });
        }
      }

      setRouteSegments(segs);
      setRouteStats({ distance: trip.distance, duration: trip.duration });
      setOptimizedOrder(results as any);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleGPSLocation = () => {
    if (!navigator.geolocation) {
      alert("您的瀏覽器不支援 GPS 定位");
      return;
    }

    setIsSyncing(true); // Reuse syncing state as simple loader
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setStartPoint({ id: 'start-gps', lat: latitude, lng: longitude, name: '目前位置 (GPS)' });
        setMapCenter([latitude, longitude]);
        setIsSyncing(false);
        setMode('none');
      },
      (error) => {
        setIsSyncing(false);
        alert(`定位失敗: ${error.message}`);
      },
      { enableHighAccuracy: true }
    );
  };

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
      setStartPoint({ id: 'start', lat, lng, name: '出發點 (模擬)' });
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
    if (!startPoint) { alert("請先設定出發點"); return; }
    if (selectedLightIds.size === 0) { alert("請選擇至少一個路燈"); return; }
    setIsCalculating(true);
    try {
      const sLights = lights.filter(l => selectedLightIds.has(l.id));
      const coords = [`${startPoint.lng},${startPoint.lat}`, ...sLights.map(l => `${l.lng},${l.lat}`)].join(';');
      const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=first&geometries=geojson&steps=true&overview=full`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== 'Ok') throw new Error(data.message || data.code);

      const trip = data.trips[0];

      // 1. Waypoints mapping (OSRM waypoint[i] corresponds to input coordinate[i])
      // Attach the original index to each waypoint so we can map it back after sorting
      const waypointsWithOriginalIndex = data.waypoints.map((wp: any, idx: number) => ({
        ...wp,
        originalInputIndex: idx
      }));

      // 2. Sort waypoints by the order they are visited in the trip
      const sortedWps = [...waypointsWithOriginalIndex].sort((a, b) => a.waypoint_index - b.waypoint_index);
      const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];

      // 3. Legs mapping for colored path segments
      const segs = trip.legs.map((leg: any, idx: number) => ({
        geometry: { type: "LineString", coordinates: leg.steps ? leg.steps.flatMap((s: any) => s.geometry.coordinates) : [] },
        color: colors[idx % colors.length]
      })).filter((s: any) => s.geometry.coordinates.length > 0);

      // 4. Final Optimized Order with Distances
      const results = [];
      // trip.legs[i] is the journey from sortedWps[i] to sortedWps[i+1]
      for (let i = 1; i < sortedWps.length; i++) {
        const wp = sortedWps[i];
        const dist = trip.legs[i - 1] ? trip.legs[i - 1].distance : 0;

        // originalInputIndex 0 is startPoint, 1+ are sLights
        const sLightIndex = wp.originalInputIndex - 1;
        const pt = sLights[sLightIndex];

        if (pt) {
          results.push({
            ...pt,
            distanceTo: dist,
            durationTo: trip.legs[i - 1] ? trip.legs[i - 1].duration : 0,
            color: colors[(i - 1) % colors.length]
          });
        }
      }

      setRouteSegments(segs);
      setRouteStats({ distance: trip.distance, duration: trip.duration });
      setOptimizedOrder(results as any);
    } catch (err: any) {
      console.error("Routing Error:", err);
      alert("規劃出錯: " + err.toString());
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans relative">
      {/* Mobile Backdrop Overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[1000] md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar - Responsive */}
      <div className={`
        fixed md:relative top-0 left-0 h-full bg-white shadow-2xl flex flex-col z-[1001] md:z-10
        transition-all duration-300 ease-in-out transform
        ${showSidebar ? 'translate-x-0 w-80 lg:w-96' : '-translate-x-full w-0 md:w-0'}
      `}>
        <div className="p-4 lg:p-6 bg-blue-600 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <MapPin className="w-6 h-6 shrink-0" />
            <div className="truncate">
              <h1 className="text-xl lg:text-2xl font-bold truncate">路燈導航</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-blue-500 rounded-full transition-colors"
              title="設定"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSidebar(false)}
              className="md:hidden p-2 hover:bg-blue-500 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          </div>
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
                  <div className="font-medium text-green-700 flex items-center gap-1">
                    {startPoint.id.includes('gps') ? <Navigation className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                    {startPoint.name}
                  </div>
                  <div className="text-xs text-gray-500">{startPoint.lat.toFixed(5)}, {startPoint.lng.toFixed(5)}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setStartPoint(null);
                      setMode('set_start');
                    }}
                    className="text-blue-500 hover:text-blue-700 text-xs font-medium"
                  >
                    修改
                  </button>
                  <button
                    onClick={() => setStartPoint(null)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode(mode === 'set_start' ? 'none' : 'set_start')}
                  className={`py-3 px-3 rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1
                    ${mode === 'set_start'
                      ? 'border-green-500 bg-green-50 text-green-700 scale-95'
                      : 'border-gray-200 hover:border-green-400 hover:bg-green-50 text-gray-600'}`}
                >
                  <LocateFixed className="w-5 h-5 text-blue-500" />
                  <span className="text-xs font-bold">手動模擬</span>
                  <span className="text-[9px] opacity-70">點擊地圖設定</span>
                </button>

                <button
                  onClick={handleGPSLocation}
                  disabled={isSyncing}
                  className="py-3 px-3 rounded-lg border-2 border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 text-gray-600 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                >
                  {isSyncing ? (
                    <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                  ) : (
                    <Navigation className="w-5 h-5 text-emerald-600" />
                  )}
                  <span className="text-xs font-bold">手機 GPS</span>
                  <span className="text-[9px] opacity-70">獲取目前位置</span>
                </button>
              </div>
            )}
            {mode === 'set_start' && (
              <div className="mt-2 text-center text-xs text-green-600 font-medium animate-pulse">
                已進入設定模式，請點擊地圖或路燈圖示...
              </div>
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
                      <div className="flex-1 min-w-0 py-1">
                        <div className="font-medium text-sm text-gray-800 break-words">{light.name}</div>
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

            {optimizedOrder.length > 0 && (
              <button
                onClick={async () => {
                  if (mode !== 'navigating') {
                    await requestOrientationPermission();
                    setMode('navigating');
                  } else {
                    setMode('none');
                  }
                }}
                className={`w-full mt-2 py-3 border-2 font-bold rounded-lg transition-all flex items-center justify-center gap-2
                  ${mode === 'navigating'
                    ? 'border-red-500 bg-red-50 text-red-600'
                    : 'border-blue-600 bg-white text-blue-600 hover:bg-blue-50'}`}
              >
                {mode === 'navigating' ? (
                  <>
                    <X className="w-5 h-5" />
                    停止導航
                  </>
                ) : (
                  <>
                    <Navigation className="w-5 h-5 animate-pulse" />
                    進入導航模式 (GPS)
                  </>
                )}
              </button>
            )}
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
                    <div
                      className="absolute -left-[25px] top-1 w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-sm"
                      style={{ backgroundColor: light.color || '#10b981' }}
                    >
                      {index + 1}
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-start gap-3">
                        <div className="font-bold text-gray-800 flex-1 break-words">{light.name}</div>
                        {light.distanceTo !== undefined && (
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <div className="text-[11px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-sm">
                              +{light.distanceTo > 1000 ? `${(light.distanceTo / 1000).toFixed(2)}km` : `${Math.round(light.distanceTo)}m`}
                            </div>
                            {light.durationTo !== undefined && (
                              <div className="text-[10px] text-gray-400 font-medium">
                                車程約 {Math.ceil(light.durationTo / 60)} 分
                              </div>
                            )}
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
      <div className="flex-1 relative h-full">
        {/* Mobile Toggle Button */}
        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="absolute top-4 left-4 z-[1000] bg-white p-3 rounded-xl shadow-lg border border-gray-200 text-blue-600 hover:bg-blue-50 transition-all active:scale-95 flex items-center gap-2 font-bold"
          >
            <Menu className="w-6 h-6" />
            <span className="md:hidden">控制面板</span>
          </button>
        )}
        <Map
          lights={lights}
          startPoint={startPoint}
          selectedLightIds={selectedLightIds}
          routeSegments={routeSegments}
          optimizedOrder={optimizedOrder}
          mode={mode}
          onMapClick={handleMapClick}
          onMarkerClick={(light) => {
            if (mode === 'set_start') {
              setStartPoint(light);
              setMode('none');
            }
          }}
          center={mapCenter}
        />

        {/* Mode Indicator Overlay */}
        {mode !== 'none' && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-lg border font-medium flex items-center gap-2 animate-bounce pointer-events-none
            ${mode === 'navigating' ? 'border-red-200 text-red-800' : 'border-blue-200 text-blue-800'}`}>
            {mode === 'add_light' ? (
              <>
                <MapPin className="w-5 h-5" />
                點擊地圖新增路燈
              </>
            ) : mode === 'set_start' ? (
              <>
                <LocateFixed className="w-5 h-5 text-green-600" />
                <span className="text-green-700">點擊地圖設定出發點</span>
              </>
            ) : (
              <>
                <Navigation className="w-5 h-5 text-blue-600 animate-pulse" />
                導航模式中：手機定位與方向追蹤
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  上傳授權密碼 (選填)
                </label>
                <input
                  type="password"
                  value={syncPassword}
                  onChange={(e) => setSyncPassword(e.target.value)}
                  placeholder="設置密碼以防止他人誤傳"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
                <p className="text-xs text-gray-500 mt-2">
                  若在此設定密碼，之後點擊「上傳至雲端」時必須輸入正確密碼才能執行。
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
