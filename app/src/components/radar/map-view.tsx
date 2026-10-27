"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { cx } from "@/lib/cx";

// [id, lng, lat, score, status(0 novo, 1 prospectado, 2 descartado)]
export type Point = [number, number, number, number, number];

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const BRASIL: [[number, number], [number, number]] = [[-74.5, -34.2], [-34.2, 5.6]];

// Escala do potencial: cinza (baixo) → laranja claro → laranja → laranja fechado (forte).
const COLOR = ["step", ["get", "s"], "#bdb6ad", 40, "#f2b08f", 60, "#ea622d", 80, "#a8380f"];

type Props = {
  points: Point[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  fitKey: string;
  loading: boolean;
  /** Área coberta pelos painéis flutuantes; o mapa centraliza no espaço livre e afasta os controles. */
  pad?: { top: number; right: number; bottom: number; left: number };
};

const NO_PAD = { top: 0, right: 0, bottom: 0, left: 0 };

export function MapView({ points, selectedId, onSelect, fitKey, loading, pad = NO_PAD }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const lastFit = useRef<string | null>(null);
  const padRef = useRef(pad);
  useEffect(() => {
    padRef.current = pad;
  });

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      if (disposed || !el.current) return;
      const m = new ml.Map({
        container: el.current,
        style: STYLE_URL,
        bounds: BRASIL,
        fitBoundsOptions: { padding: 20 },
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      m.on("error", (e) => {
        if (!m.isStyleLoaded() && String(e.error?.message ?? "").match(/fetch|style|Failed/i)) setFailed(true);
      });
      m.on("load", () => {
        m.addSource("leads", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 42,
          clusterMaxZoom: 11,
          clusterProperties: { maxS: ["max", ["get", "s"]] },
        });
        m.addLayer({
          id: "clusters",
          type: "circle",
          source: "leads",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1b1a1a",
            "circle-opacity": 0.88,
            "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22, 400, 28],
            "circle-stroke-width": 3,
            "circle-stroke-color": ["step", ["get", "maxS"], "#bdb6ad", 60, "#f2b08f", 80, "#ea622d"],
          },
        });
        m.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "leads",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
          paint: { "text-color": "#f8f1e7" },
        });
        m.addLayer({
          id: "points",
          type: "circle",
          source: "leads",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": COLOR as never,
            "circle-radius": ["interpolate", ["linear"], ["get", "s"], 0, 4, 60, 6.5, 100, 10],
            "circle-stroke-width": 1.25,
            "circle-stroke-color": "#fffdf9",
            "circle-opacity": ["case", ["==", ["get", "st"], 2], 0.35, 0.95],
          },
        });
        m.addLayer({
          id: "selected",
          type: "circle",
          source: "leads",
          filter: ["==", ["get", "id"], -1],
          paint: { "circle-radius": 15, "circle-color": "rgba(234,98,45,0.12)", "circle-stroke-width": 2.5, "circle-stroke-color": "#1b1a1a" },
        });

        m.on("click", "clusters", async (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const src = m.getSource("leads") as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
          m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.2, duration: 450 });
        });
        m.on("click", "points", (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties.id;
          if (typeof id === "number") onSelectRef.current(id);
        });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
        for (const layer of ["clusters", "points"]) {
          m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", layer, () => {
            m.getCanvas().style.cursor = "";
            popup.remove();
          });
        }
        m.on("mousemove", "points", (e: MapLayerMouseEvent) => {
          const p = e.features?.[0]?.properties;
          if (!p) return;
          popup.setLngLat(e.lngLat).setHTML(`<strong>Score ${p.s}</strong>${p.st === 2 ? " · descartada" : p.st === 1 ? " · prospectada" : ""}`).addTo(m);
        });
        m.on("mousemove", "clusters", (e: MapLayerMouseEvent) => {
          const p = e.features?.[0]?.properties;
          if (!p) return;
          popup.setLngLat(e.lngLat).setHTML(`${p.point_count} empresas · melhor score <strong>${p.maxS}</strong>`).addTo(m);
        });
        setReady(true);
      });
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const src = m.getSource("leads") as GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: points.map(([id, lng, lat, s, st]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { id, s, st } })),
    });
    if (lastFit.current !== fitKey && points.length && !loading) {
      lastFit.current = fitKey;
      let [w, s, e, n] = [180, 90, -180, -90];
      for (const [, lng, lat] of points) {
        w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
      }
      const p = padRef.current;
      m.fitBounds([[w, s], [e, n]], { padding: { top: p.top + 40, right: p.right + 40, bottom: p.bottom + 40, left: p.left + 40 }, maxZoom: 11.5, duration: 600 });
    }
  }, [points, ready, fitKey, loading]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setFilter("selected", ["==", ["get", "id"], selectedId ?? -1]);
  }, [selectedId, ready]);

  return (
    <div
      className="radar-map relative h-full w-full"
      aria-label="Mapa das empresas filtradas. A lista ao lado tem o mesmo conteúdo acessível por teclado."
      role="region"
      style={{ "--pad-top": `${pad.top}px`, "--pad-right": `${pad.right}px`, "--pad-left": `${pad.left}px` } as React.CSSProperties}
    >
      <div ref={el} className={cx("h-full w-full transition-opacity duration-500", ready ? "opacity-100" : "opacity-0")} />
      {(loading || !ready) && !failed && (
        <div
          className="pointer-events-none absolute bottom-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/85 px-3 py-1.5 text-xs text-cream shadow-[var(--shadow-pop)] backdrop-blur"
          style={{ left: `calc(${pad.left}px + (100% - ${pad.left + pad.right}px) / 2)` }}
        >
          <span className="size-3 animate-spin rounded-full border-[1.5px] border-cream/30 border-t-orange" aria-hidden />
          {ready ? "Atualizando o mapa…" : "Carregando o mapa…"}
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-cream-2/90 p-6 text-center text-sm text-muted">
          Não foi possível carregar o mapa base (sem conexão com tiles.openfreemap.org). A lista continua funcionando.
        </div>
      )}
      <Legend />
    </div>
  );
}

function Legend() {
  const items = [["#a8380f", "80+"], ["#ea622d", "60"], ["#f2b08f", "40"], ["#bdb6ad", "<40"]];
  return (
    <div className="map-legend absolute bottom-9 left-3 flex items-center gap-2.5 rounded-full border border-line bg-paper/85 px-3 py-1.5 text-[11px] text-ink/75 shadow-[var(--shadow-lift)] backdrop-blur-md md:bottom-3">
      <span className="font-medium text-ink">Score</span>
      <ul className="flex items-center gap-2.5">
        {items.map(([c, l]) => (
          <li key={l} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: c }} />
            {l}
          </li>
        ))}
        <li className="flex items-center gap-1 text-muted" title="Grupo de empresas próximas; clique para aproximar">
          <span className="flex size-3.5 items-center justify-center rounded-full bg-ink text-[7px] text-cream">n</span>
          grupo
        </li>
      </ul>
    </div>
  );
}
