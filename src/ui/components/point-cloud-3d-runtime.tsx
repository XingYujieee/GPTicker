import { useEffect, useMemo, useRef, useState } from "react";
import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  MathUtils,
  Points,
  ShaderMaterial,
  Vector3
} from "three";
import { generateKeywordPointCloudData } from "../../shared/utils";
import type {
  ConversationNode,
  HoverPreviewPayload,
  KeywordDatum,
  KeywordPointCloudData,
  KeywordPointMeta
} from "../../shared/types";

const LABEL_LIMIT = 12;
const CLOUD_Y_OFFSET = -2.4;
const DRAG_CLICK_THRESHOLD = 6;

export interface PointCloud3DProps {
  nodes: ConversationNode[];
  keywords: KeywordDatum[];
  activeKeywords: string[];
  prefersDark: boolean;
  onToggleKeyword: (keyword: string) => void;
  onPreviewChange?: (preview: HoverPreviewPayload | null) => void;
}

export function PointCloud3DRuntime({
  nodes,
  keywords,
  activeKeywords,
  prefersDark,
  onToggleKeyword,
  onPreviewChange
}: PointCloud3DProps) {
  const data = useMemo(
    () => generateKeywordPointCloudData(nodes, keywords, activeKeywords),
    [activeKeywords, keywords, nodes]
  );
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const visibleLabelIndices = useMemo(
    () => buildVisibleLabelIndices(data, hoveredIndex),
    [data, hoveredIndex]
  );
  const highlightedNeighbors = useMemo(
    () => buildHighlightedNeighbors(data.links, hoveredIndex),
    [data.links, hoveredIndex]
  );

  useEffect(() => {
    return () => {
      onPreviewChange?.(null);
    };
  }, [onPreviewChange]);

  useEffect(() => {
    setFocusedIndex((current) => {
      if (current === null) {
        return current;
      }

      return current >= 0 && current < data.meta.length ? current : null;
    });
  }, [data.meta.length]);

  if (data.meta.length === 0) {
    return (
      <div
        className={[
          "flex h-full items-center justify-center rounded-[28px] border px-6 text-center text-sm leading-6",
          prefersDark
            ? "border-slate-800 bg-slate-950/80 text-slate-500"
            : "border-slate-200 bg-white text-slate-600"
        ].join(" ")}
      >
        还没有足够的关键词来映射 3D 知识全景。
      </div>
    );
  }

  return (
    <div
      className={[
        "relative h-full overflow-hidden rounded-[28px] border",
        prefersDark ? "border-slate-800" : "border-slate-200"
      ].join(" ")}
      style={{
        background: prefersDark
          ? "radial-gradient(circle at 18% 16%, rgba(0, 242, 254, 0.08), transparent 24%), radial-gradient(circle at 84% 20%, rgba(79, 172, 254, 0.09), transparent 26%), radial-gradient(circle at 55% 74%, rgba(15, 23, 42, 0.34), transparent 30%), linear-gradient(180deg, rgba(1, 4, 12, 1), rgba(2, 6, 23, 0.995) 42%, rgba(0, 0, 0, 1))"
          : "radial-gradient(circle at 20% 14%, rgba(14,165,233,0.18), transparent 24%), radial-gradient(circle at 82% 18%, rgba(96,165,250,0.16), transparent 28%), radial-gradient(circle at 46% 78%, rgba(186,230,253,0.48), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.99) 42%, rgba(226,232,240,0.98))"
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: prefersDark
            ? "radial-gradient(circle at center, rgba(255,255,255,0.02), transparent 65%)"
            : "radial-gradient(circle at center, rgba(255,255,255,0.6), transparent 62%)"
        }}
      />
      <Canvas
        dpr={[1, 1.75]}
        frameloop="always"
        camera={{
          position: [0, 5.4, 20.5],
          fov: 45,
          near: 0.1,
          far: 200
        }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance"
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ScholarlyNebulaScene
          data={data}
          prefersDark={prefersDark}
          visibleLabelIndices={visibleLabelIndices}
          highlightedNeighbors={highlightedNeighbors}
          hoveredIndex={hoveredIndex}
          focusedIndex={focusedIndex}
          onHoverIndexChange={setHoveredIndex}
          onFocusIndexChange={setFocusedIndex}
          onToggleKeyword={onToggleKeyword}
          onPreviewChange={onPreviewChange}
        />
      </Canvas>

      <div
        className={[
          "pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl border px-3 py-2 text-[11px] leading-5 backdrop-blur",
          prefersDark
            ? "border-slate-800/80 bg-slate-950/76 text-slate-300"
            : "border-slate-200 bg-white/88 text-slate-700"
        ].join(" ")}
      >
        拖拽旋转，滚轮缩放，悬停查看关键词，点击粒子切换该关键词过滤。
      </div>
    </div>
  );
}

function ScholarlyNebulaScene({
  data,
  prefersDark,
  visibleLabelIndices,
  highlightedNeighbors,
  hoveredIndex,
  focusedIndex,
  onHoverIndexChange,
  onFocusIndexChange,
  onToggleKeyword,
  onPreviewChange
}: {
  data: KeywordPointCloudData;
  prefersDark: boolean;
  visibleLabelIndices: ReadonlySet<number>;
  highlightedNeighbors: ReadonlySet<number>;
  hoveredIndex: number;
  focusedIndex: number | null;
  onHoverIndexChange: (index: number) => void;
  onFocusIndexChange: (index: number | null) => void;
  onToggleKeyword: (keyword: string) => void;
  onPreviewChange?: (preview: HoverPreviewPayload | null) => void;
}) {
  const { raycaster } = useThree();
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const pointsRef = useRef<Points>(null);
  const starFieldRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const hoveredIndexRef = useRef(-1);
  const focusTargetRef = useRef(new Vector3(0, CLOUD_Y_OFFSET - 0.2, 0));
  const focusDeltaRef = useRef(new Vector3());
  const controlsReadyRef = useRef(false);
  const farStarGeometry = useMemo(() => buildStarFieldGeometry(220, 78, 24), []);
  const nearStarGeometry = useMemo(() => buildStarFieldGeometry(128, 46, 12), []);
  const pointsGeometry = useMemo(() => buildPointGeometry(data), [data]);
  const material = useMemo(() => createNebulaMaterial(), []);
  const baseLinksGeometry = useMemo(
    () => buildConstellationGeometry(data, null),
    [data]
  );
  const highlightedLinksGeometry = useMemo(
    () => buildConstellationGeometry(data, hoveredIndex),
    [data, hoveredIndex]
  );

  useEffect(() => {
    raycaster.params.Points.threshold = 0.84;
  }, [raycaster]);

  useEffect(() => {
    return () => {
      pointsGeometry.dispose();
      farStarGeometry.dispose();
      nearStarGeometry.dispose();
      baseLinksGeometry.dispose();
      highlightedLinksGeometry.dispose();
      material.dispose();
      glowTexture.dispose();
    };
  }, [
    baseLinksGeometry,
    farStarGeometry,
    glowTexture,
    highlightedLinksGeometry,
    material,
    nearStarGeometry,
    pointsGeometry
  ]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    material.uniforms.uTime.value = elapsed;
    material.uniforms.uHoveredIndex.value = hoveredIndex;

    if (starFieldRef.current) {
      starFieldRef.current.rotation.y = elapsed * 0.02;
      starFieldRef.current.rotation.x = Math.sin(elapsed * 0.08) * 0.03;
    }

    const controls = controlsRef.current;

    if (controls) {
      if (!controlsReadyRef.current) {
        controls.target.copy(focusTargetRef.current);
        controls.update();
        controlsReadyRef.current = true;
      }

      focusDeltaRef.current
        .copy(focusTargetRef.current)
        .sub(controls.target);

      if (focusDeltaRef.current.lengthSq() > 0.0001) {
        focusDeltaRef.current.multiplyScalar(0.14);
        controls.target.add(focusDeltaRef.current);
        controls.object.position.add(focusDeltaRef.current);
      }

      controls.update();
    }
  });

  useEffect(() => {
    if (focusedIndex === null) {
      focusTargetRef.current.set(0, CLOUD_Y_OFFSET - 0.2, 0);
      return;
    }

    const offset = focusedIndex * 3;

    focusTargetRef.current.set(
      data.positions[offset],
      data.positions[offset + 1] + CLOUD_Y_OFFSET,
      data.positions[offset + 2]
    );
  }, [data.positions, focusedIndex]);

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const hitIndex = event.index ?? -1;

    if (hitIndex === hoveredIndexRef.current) {
      return;
    }

    hoveredIndexRef.current = hitIndex;
    onHoverIndexChange(hitIndex);

    if (hitIndex >= 0) {
      const meta = data.meta[hitIndex];

      onPreviewChange?.(
        buildPreviewPayload(
          meta.term,
          meta.count,
          hitIndex,
          event.clientX,
          event.clientY
        )
      );
      return;
    }

    onPreviewChange?.(null);
  };

  const handlePointerOut = () => {
    hoveredIndexRef.current = -1;
    onHoverIndexChange(-1);
    onPreviewChange?.(null);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    if (event.delta > DRAG_CLICK_THRESHOLD) {
      return;
    }

    const hitIndex = event.index ?? -1;

    if (hitIndex >= 0) {
      onFocusIndexChange(hitIndex);
      onToggleKeyword(data.meta[hitIndex].term);
    }
  };

  return (
    <>
      <group ref={starFieldRef} position={[0, -0.8, -18]}>
        <points geometry={farStarGeometry}>
          <pointsMaterial
            map={glowTexture}
            color={prefersDark ? "#5f91c7" : "#93c5fd"}
            size={0.18}
            sizeAttenuation
            transparent
            opacity={prefersDark ? 0.22 : 0.14}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </points>
        <points geometry={nearStarGeometry}>
          <pointsMaterial
            map={glowTexture}
            color={prefersDark ? "#d8f5ff" : "#38bdf8"}
            size={0.12}
            sizeAttenuation
            transparent
            opacity={prefersDark ? 0.38 : 0.22}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </points>
      </group>

      <group position={[0, CLOUD_Y_OFFSET, 0]}>
        <lineSegments geometry={baseLinksGeometry}>
          <lineBasicMaterial
            color={prefersDark ? "#60a5fa" : "#2563eb"}
            transparent
            opacity={prefersDark ? 0.1 : 0.16}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </lineSegments>
        {hoveredIndex >= 0 ? (
          <lineSegments geometry={highlightedLinksGeometry}>
            <lineBasicMaterial
              color={prefersDark ? "#c4f1ff" : "#0ea5e9"}
              transparent
              opacity={prefersDark ? 0.36 : 0.26}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </lineSegments>
        ) : null}

        <points
          ref={pointsRef}
          geometry={pointsGeometry}
          material={material}
          frustumCulled={false}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerOut}
          onClick={handleClick}
        />

        <KeywordLabels
          data={data}
          prefersDark={prefersDark}
          visibleLabelIndices={visibleLabelIndices}
          highlightedNeighbors={highlightedNeighbors}
          hoveredIndex={hoveredIndex}
        />
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        minDistance={10}
        maxDistance={30}
        rotateSpeed={0.34}
        zoomSpeed={0.46}
        minPolarAngle={Math.PI * 0.38}
        maxPolarAngle={Math.PI * 0.66}
        minAzimuthAngle={-Math.PI * 0.56}
        maxAzimuthAngle={Math.PI * 0.56}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          luminanceThreshold={0.28}
          luminanceSmoothing={0.8}
          intensity={prefersDark ? 0.72 : 0.32}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

function KeywordLabels({
  data,
  prefersDark,
  visibleLabelIndices,
  highlightedNeighbors,
  hoveredIndex
}: {
  data: KeywordPointCloudData;
  prefersDark: boolean;
  visibleLabelIndices: ReadonlySet<number>;
  highlightedNeighbors: ReadonlySet<number>;
  hoveredIndex: number;
}) {
  return (
    <>
      {data.meta.map((meta, index) => {
        const active = data.active[index] > 0.5;
        const accent = data.accent[index] > 0.5;
        const highlighted = hoveredIndex === index;
        const related = highlightedNeighbors.has(index);
        const visible = highlighted || active || related || visibleLabelIndices.has(index);

        if (!visible) {
          return null;
        }

        const offset = index * 3;
        const position: [number, number, number] = [
          data.positions[offset],
          data.positions[offset + 1],
          data.positions[offset + 2]
        ];

        return (
          <DepthAwareKeywordLabel
            key={meta.term}
            meta={meta}
            position={position}
            prefersDark={prefersDark}
            active={active}
            accent={accent}
            highlighted={highlighted}
            related={related}
          />
        );
      })}
    </>
  );
}

function DepthAwareKeywordLabel({
  meta,
  position,
  prefersDark,
  active,
  accent,
  highlighted,
  related
}: {
  meta: KeywordPointMeta;
  position: [number, number, number];
  prefersDark: boolean;
  active: boolean;
  accent: boolean;
  highlighted: boolean;
  related: boolean;
}) {
  const labelRef = useRef<HTMLDivElement>(null);
  const world = useMemo(() => new Vector3(...position), [position]);

  useFrame(({ camera }) => {
    const label = labelRef.current;

    if (!label) {
      return;
    }

    const distance = camera.position.distanceTo(world);
    const opacity = highlighted
      ? 1
      : related
        ? MathUtils.clamp(1 - (distance - 11) / 22, 0.48, 0.92)
        : MathUtils.clamp(1 - (distance - 10) / 18, 0.22, 0.9);
    const blur = distance > 24 && !highlighted
      ? Math.min(1.6, (distance - 24) / 14)
      : 0;
    const scale = highlighted
      ? 1.05
      : active
        ? 1.02
        : MathUtils.clamp(1.02 - distance / 180, 0.88, 1);

    label.style.opacity = opacity.toFixed(2);
    label.style.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : "none";
    label.style.transform = `translateY(-50%) scale(${scale.toFixed(2)})`;
  });

  return (
    <Html
      position={position}
      zIndexRange={[120, 0]}
      occlude={false}
      pointerEvents="none"
    >
      <div
        ref={labelRef}
        className="pointer-events-none relative flex items-center gap-1.5 pl-3 whitespace-nowrap"
        style={{ transform: "translateY(-50%)" }}
      >
        <span
          className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: highlighted
              ? prefersDark
                ? "#ffffff"
                : "#0f172a"
              : active
                ? prefersDark
                  ? "#00f2fe"
                  : "#0284c7"
                : accent
                  ? "#f59e0b"
                  : getKeywordLabelDotColor(meta.kind, prefersDark),
            boxShadow: highlighted
              ? prefersDark
                ? "0 0 14px rgba(255,255,255,0.5)"
                : "0 0 10px rgba(15,23,42,0.18)"
              : active
                ? prefersDark
                  ? "0 0 10px rgba(0,242,254,0.3)"
                  : "0 0 8px rgba(14,165,233,0.18)"
                : accent
                  ? "0 0 8px rgba(245,158,11,0.26)"
                  : prefersDark
                    ? "0 0 6px rgba(96,165,250,0.18)"
                    : "0 0 6px rgba(59,130,246,0.12)"
          }}
        />
        <span
          className="h-px w-3 shrink-0 rounded-full"
          style={{
            background: highlighted
              ? prefersDark
                ? "rgba(255,255,255,0.82)"
                : "rgba(15,23,42,0.62)"
              : related
                ? prefersDark
                  ? "rgba(196,241,255,0.72)"
                  : "rgba(14,165,233,0.48)"
                : prefersDark
                  ? "rgba(148,163,184,0.44)"
                  : "rgba(148,163,184,0.38)"
          }}
        />
        <span
          className="rounded-full border px-2 py-0.5 font-medium tracking-[0.08em]"
          style={{
            color: highlighted
              ? prefersDark
                ? "#ffffff"
                : "#0f172a"
              : prefersDark
                ? "#d9f4ff"
                : "#0f172a",
            fontSize: `${11 + Math.min(4, meta.count)}px`,
            background: highlighted
              ? prefersDark
                ? "rgba(2, 12, 24, 0.96)"
                : "rgba(255,255,255,0.96)"
              : active
                ? prefersDark
                  ? "rgba(3, 18, 31, 0.92)"
                  : "rgba(240,249,255,0.96)"
                : prefersDark
                  ? "rgba(2, 8, 20, 0.84)"
                  : "rgba(255,255,255,0.88)",
            borderColor: highlighted
              ? prefersDark
                ? "rgba(255,255,255,0.7)"
                : "rgba(15,23,42,0.22)"
              : active
                ? prefersDark
                  ? "rgba(0,242,254,0.45)"
                  : "rgba(14,165,233,0.34)"
                : accent
                  ? "rgba(245,158,11,0.4)"
                  : prefersDark
                    ? "rgba(71,85,105,0.8)"
                    : "rgba(148,163,184,0.5)",
            boxShadow: highlighted
              ? prefersDark
                ? "0 10px 28px rgba(2,12,24,0.32)"
                : "0 10px 22px rgba(148,163,184,0.24)"
              : prefersDark
                ? "0 8px 18px rgba(2,6,23,0.22)"
                : "0 8px 18px rgba(148,163,184,0.18)"
          }}
        >
          {meta.term}
        </span>
      </div>
    </Html>
  );
}

function buildPointGeometry(data: KeywordPointCloudData) {
  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  geometry.setAttribute("aSize", new BufferAttribute(data.sizes, 1));
  geometry.setAttribute("aIndex", new BufferAttribute(data.indices, 1));
  geometry.setAttribute("aActive", new BufferAttribute(data.active, 1));
  geometry.setAttribute("aAccent", new BufferAttribute(data.accent, 1));

  return geometry;
}

function createNebulaMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHoveredIndex: { value: -1 },
      uPixelRatio: {
        value: typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 2)
      }
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      attribute float aIndex;
      attribute float aActive;
      attribute float aAccent;
      uniform float uTime;
      uniform float uHoveredIndex;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vHovered;
      varying float vActive;
      varying float vAccent;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float hovered = step(abs(aIndex - uHoveredIndex), 0.1);
        float breath = (0.5 + 0.5 * sin(uTime * (0.8 + aAccent * 0.2) + aIndex * 0.28)) * (0.08 + aActive * 0.06 + aAccent * 0.08);
        float size = aSize * (1.0 + hovered * 0.42 + breath);
        float distanceScale = 170.0 / max(4.0, -mvPosition.z);

        vColor = color;
        vHovered = hovered;
        vActive = aActive;
        vAccent = aAccent;
        gl_PointSize = min(36.0, size * uPixelRatio * distanceScale);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vHovered;
      varying float vActive;
      varying float vAccent;

      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float distanceToCenter = length(center);
        float halo = smoothstep(0.54, 0.0, distanceToCenter);
        float core = smoothstep(0.16, 0.0, distanceToCenter);
        float alpha = halo * (0.52 + vHovered * 0.26 + vActive * 0.18 + vAccent * 0.12);
        vec3 color = vColor * (0.96 + core * 0.4 + vHovered * 0.24 + vAccent * 0.14);

        if (alpha <= 0.01) {
          discard;
        }

        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function buildConstellationGeometry(
  data: KeywordPointCloudData,
  hoveredIndex: number | null
) {
  const relevantLinks = data.links
    .filter((link) =>
      hoveredIndex === null
        ? link.weight >= 0.22
        : link.from === hoveredIndex || link.to === hoveredIndex
    )
    .slice(0, hoveredIndex === null ? 28 : 12);
  const geometry = new BufferGeometry();
  const segments = new Float32Array(relevantLinks.length * 6);

  relevantLinks.forEach((link, index) => {
    const fromOffset = link.from * 3;
    const toOffset = link.to * 3;
    const baseOffset = index * 6;

    segments[baseOffset] = data.positions[fromOffset];
    segments[baseOffset + 1] = data.positions[fromOffset + 1];
    segments[baseOffset + 2] = data.positions[fromOffset + 2];
    segments[baseOffset + 3] = data.positions[toOffset];
    segments[baseOffset + 4] = data.positions[toOffset + 1];
    segments[baseOffset + 5] = data.positions[toOffset + 2];
  });

  geometry.setAttribute("position", new BufferAttribute(segments, 3));
  return geometry;
}

function buildVisibleLabelIndices(
  data: KeywordPointCloudData,
  hoveredIndex: number
) {
  const ranked = data.meta
    .map((entry, index) => ({
      index,
      score:
        entry.count +
        entry.cooccurrence * 4 +
        (data.active[index] > 0.5 ? 2 : 0) +
        (data.accent[index] > 0.5 ? 1.5 : 0)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, LABEL_LIMIT)
    .map((entry) => entry.index);
  const visible = new Set(ranked);

  if (hoveredIndex >= 0) {
    visible.add(hoveredIndex);
  }

  return visible;
}

function buildHighlightedNeighbors(
  links: KeywordPointCloudData["links"],
  hoveredIndex: number
) {
  const neighbors = new Set<number>();

  if (hoveredIndex < 0) {
    return neighbors;
  }

  links.forEach((link) => {
    if (link.from === hoveredIndex) {
      neighbors.add(link.to);
    } else if (link.to === hoveredIndex) {
      neighbors.add(link.from);
    }
  });

  return neighbors;
}

function buildPreviewPayload(
  term: string,
  count: number,
  index: number,
  clientX: number,
  clientY: number
): HoverPreviewPayload {
  return {
    kind: "keyword",
    text: term,
    label: `${count} 次命中`,
    index,
    top: clientY,
    left: clientX - 14
  };
}

function buildStarFieldGeometry(count: number, radius: number, depthOffset: number) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const stride = index * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const distance = radius * (0.72 + Math.random() * 0.28);

    positions[stride] = Math.cos(theta) * Math.sin(phi) * distance;
    positions[stride + 1] = Math.sin(theta) * Math.sin(phi) * distance * 0.72;
    positions[stride + 2] = Math.cos(phi) * distance - depthOffset;
  }

  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");

  if (!context) {
    return new CanvasTexture(canvas);
  }

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.24, "rgba(191,245,255,0.95)");
  gradient.addColorStop(0.58, "rgba(103,232,249,0.3)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function getKeywordLabelDotColor(
  kind: KeywordPointMeta["kind"],
  prefersDark: boolean
) {
  if (!prefersDark) {
    switch (kind) {
      case "core":
        return "#2563eb";
      case "code":
        return "#7c3aed";
      case "concept":
        return "#0284c7";
      default:
        return new Color("#475569").getStyle();
    }
  }

  switch (kind) {
    case "core":
      return "#4facfe";
    case "code":
      return "#ab7bff";
    case "concept":
      return "#7dd3fc";
    default:
      return new Color("#1d4ed8").getStyle();
  }
}
