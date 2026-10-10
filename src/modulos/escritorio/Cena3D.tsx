import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, RoundedBox, OrthographicCamera } from "@react-three/drei";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, PCFShadowMap, Vector3, type Group, type Mesh, type OrthographicCamera as ThreeOrtho } from "three";
import { Plus, Minus, Maximize2 } from "lucide-react";
import { T } from "../../textos/textos";
import { Personagem } from "../../personagens/Personagem";
import { useConfig } from "../../estado/configuracoes";
import { AGENTES } from "../../estado/agentes";
import { Pensamento } from "./Pensamento";
import { MESAS, LUGARES, type Comportamento } from "./comportamento";
import type { AgenteId } from "../../tipos";

interface Props {
  comportamento: Record<AgenteId, Comportamento>;
  tarefas: Record<AgenteId, string>;
  aoEscolher: (a: AgenteId) => void;
  escuro: boolean;
}

function textura(desenhar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 512, repetir = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) desenhar(ctx, w, h);
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repetir, repetir);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function semente(n: number) {
  let s = n;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function useTexturas(escuro: boolean) {
  return useMemo(() => {
    const r = semente(7);
    const piso = textura((ctx, w, h) => {
      const tons = escuro ? ["#8a6a4c", "#7d5f43", "#946f50", "#76583d"] : ["#c79a6b", "#bf8f5f", "#cfa476", "#b88757"];
      const alturaTabua = h / 8;
      for (let i = 0; i < 8; i++) {
        let x = -(i % 2) * 120;
        while (x < w) {
          const largura = 180 + r() * 160;
          ctx.fillStyle = tons[Math.floor(r() * tons.length)];
          ctx.fillRect(x, i * alturaTabua, largura, alturaTabua);
          ctx.strokeStyle = escuro ? "rgba(0,0,0,0.45)" : "rgba(90,55,25,0.35)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, i * alturaTabua, largura, alturaTabua);
          if (r() > 0.7) {
            const nx = x + r() * largura;
            const ny = i * alturaTabua + alturaTabua / 2;
            for (let k = 1; k < 5; k++) {
              ctx.strokeStyle = escuro ? "rgba(0,0,0,0.25)" : "rgba(80,45,15,0.18)";
              ctx.beginPath();
              ctx.ellipse(nx, ny, k * 6, k * 2.4, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          for (let v = 0; v < 10; v++) {
            ctx.strokeStyle = escuro ? "rgba(255,255,255,0.03)" : "rgba(80,45,15,0.08)";
            ctx.beginPath();
            const y = i * alturaTabua + r() * alturaTabua;
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + largura / 3, y + 4, x + (largura * 2) / 3, y - 4, x + largura, y);
            ctx.stroke();
          }
          x += largura;
        }
      }
    }, 1024, 1024, 2);
    const parede = textura((ctx, w, h) => {
      ctx.fillStyle = escuro ? "#5a5f6b" : "#f1efe9";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = escuro ? `rgba(255,255,255,${r() * 0.025})` : `rgba(0,0,0,${r() * 0.025})`;
        ctx.fillRect(r() * w, r() * h, 2, 2);
      }
      for (let x = 0; x < w; x += 32) {
        ctx.fillStyle = escuro ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)";
        ctx.fillRect(x, 0, 16, h * 0.62);
      }
      ctx.fillStyle = escuro ? "#4d515c" : "#e6e1d7";
      ctx.fillRect(0, h * 0.62, w, h * 0.3);
      for (let x = 0; x < w; x += 64) {
        ctx.strokeStyle = escuro ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.08)";
        ctx.strokeRect(x + 6, h * 0.64, 52, h * 0.26);
      }
      ctx.fillStyle = escuro ? "#3a3d46" : "#d2ccc0";
      ctx.fillRect(0, h * 0.6, w, h * 0.025);
      ctx.fillStyle = escuro ? "#2f323a" : "#cfc8bb";
      ctx.fillRect(0, h * 0.92, w, h * 0.08);
    });
    const tapete = textura((ctx, w, h) => {
      ctx.fillStyle = escuro ? "#3b3550" : "#d9cbb6";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = escuro ? "#5a5278" : "#b89f80";
      ctx.lineWidth = 18;
      ctx.strokeRect(24, 24, w - 48, h - 48);
      ctx.lineWidth = 6;
      ctx.strokeRect(64, 64, w - 128, h - 128);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 40 + i * 30, 0, Math.PI * 2);
        ctx.strokeStyle = i % 2 ? (escuro ? "#7a6fa0" : "#c4a983") : escuro ? "#4b4466" : "#a88d6a";
        ctx.stroke();
      }
    });
    const quadro = textura((ctx, w, h) => {
      ctx.fillStyle = "#fbfbf8";
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      const cores = ["#3b6fe0", "#d84b4b", "#2f9e6b"];
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = cores[i % 3];
        ctx.beginPath();
        ctx.moveTo(40, 60 + i * 42);
        ctx.lineTo(40 + 120 + r() * 200, 60 + i * 42);
        ctx.stroke();
      }
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 4;
      ctx.strokeRect(300, 50, 160, 110);
      ctx.beginPath();
      ctx.moveTo(310, 150);
      ctx.lineTo(350, 100);
      ctx.lineTo(390, 125);
      ctx.lineTo(450, 70);
      ctx.stroke();
    }, 512, 256);
    const ceu = textura((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, escuro ? "#0f1630" : "#8cc8ff");
      g.addColorStop(1, escuro ? "#2a2550" : "#e3f2ff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < (escuro ? 40 : 5); i++) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        if (escuro) ctx.arc(r() * w, r() * h * 0.7, 1.5, 0, Math.PI * 2);
        else ctx.ellipse(r() * w, 40 + r() * 80, 50, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = escuro ? "#161a2a" : "#9fb3c8";
      for (let i = 0; i < 9; i++) {
        const largura = 30 + r() * 40;
        const altura = 40 + r() * 90;
        ctx.fillRect(i * 58, h - altura, largura, altura);
      }
    }, 512, 256);
    const madeira = textura((ctx, w, h) => {
      ctx.fillStyle = "#d8b48a";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        const y = r() * h;
        ctx.strokeStyle = `rgba(120,80,40,${0.05 + r() * 0.12})`;
        ctx.lineWidth = 1 + r() * 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 3);
        ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const cx = r() * w;
        const cy = r() * h;
        for (let k = 1; k < 6; k++) {
          ctx.strokeStyle = `rgba(110,70,30,${0.18 - k * 0.025})`;
          ctx.beginPath();
          ctx.ellipse(cx, cy, k * 7, k * 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }, 512, 256);
    const tecido = textura((ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + (y % 8 ? 0 : 0.04)})`;
        ctx.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + (x % 8 ? 0 : 0.03)})`;
        ctx.fillRect(x, 0, 1, h);
      }
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
        ctx.fillRect(r() * w, r() * h, 1, 1);
      }
    }, 256, 256, 3);
    const tela = textura((ctx, w, h) => {
      ctx.fillStyle = "#0e1420";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1a2232";
      ctx.fillRect(0, 0, w, 18);
      ["#f4505e", "#f5a524", "#34d399"].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(12 + i * 14, 9, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#151c2b";
      ctx.fillRect(0, 18, 60, h);
      const cores = ["#7aa2ff", "#c792ea", "#89ddff", "#c3e88d", "#f78c6c", "#9aa3b2"];
      for (let i = 0; i < 16; i++) {
        let x = 72 + (i % 4 === 0 ? 0 : 16 * (1 + (i % 3)));
        const y = 32 + i * 13;
        for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
          const largura = 14 + r() * 50;
          ctx.fillStyle = cores[Math.floor(r() * cores.length)];
          ctx.fillRect(x, y, largura, 6);
          x += largura + 6;
          if (x > w - 20) break;
        }
      }
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(10, 30 + i * 22, 40, 8);
      }
    }, 320, 200);
    piso.repeat.set(5, 3.4);
    const concreto = textura((ctx, w, h) => {
      ctx.fillStyle = escuro ? "#3a3c42" : "#cfcac2";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 14000; i++) {
        const v = r();
        ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${r() * 0.06})` : `rgba(0,0,0,${r() * 0.08})`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      ctx.fillStyle = escuro ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.08)";
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
    }, 512, 128);
    const arte = (paleta: string[], formas: number) =>
      textura((ctx, w, h) => {
        ctx.fillStyle = paleta[0];
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < formas; i++) {
          ctx.fillStyle = paleta[1 + (i % (paleta.length - 1))];
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          if (i % 3 === 0) ctx.arc(r() * w, r() * h, 30 + r() * 70, 0, Math.PI * 2);
          else if (i % 3 === 1) ctx.rect(r() * w * 0.8, r() * h * 0.8, 40 + r() * 90, 40 + r() * 120);
          else {
            ctx.moveTo(r() * w, h);
            ctx.lineTo(r() * w, r() * h * 0.4);
            ctx.lineTo(r() * w, h);
          }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }, 256, 320);
    const arte1 = arte(["#f3ead8", "#e0703f", "#2f5d62", "#f2b84b", "#1f2a44"], 9);
    const arte2 = arte(["#1f2a44", "#7c5ce0", "#ff8fab", "#9be7c4", "#f6f1e7"], 8);
    const grafico = textura((ctx, w, h) => {
      ctx.fillStyle = "#0e1420";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      for (let y = 20; y < h; y += 28) {
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 4;
      ctx.beginPath();
      let y = h * 0.75;
      ctx.moveTo(10, y);
      for (let x = 10; x < w - 10; x += 18) {
        y = Math.max(20, Math.min(h - 20, y - 6 + r() * 12 - 2));
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 3 ? "#7aa2ff" : "#f5a524";
        const alt = 20 + r() * 70;
        ctx.fillRect(20 + i * 26, h - 10 - alt, 16, alt);
      }
    }, 240, 360);
    const calendario = textura((ctx, w, h) => {
      ctx.fillStyle = "#fbfbf8";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ff5a5a";
      ctx.fillRect(0, 0, w, 46);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px sans-serif";
      ctx.fillText(String(new Date().getDate()).padStart(2, "0"), 14, 34);
      for (let i = 0; i < 35; i++) {
        const cx = 12 + (i % 7) * 34;
        const cy = 60 + Math.floor(i / 7) * 36;
        ctx.fillStyle = i === new Date().getDate() + 2 ? "#ff5a5a" : r() > 0.8 ? "#ffd7d7" : "#eeeeea";
        ctx.fillRect(cx, cy, 28, 28);
      }
    }, 256, 256);
    const armario = textura((ctx, w, h) => {
      ctx.fillStyle = escuro ? "#d9d5cc" : "#f4f1ea";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, w / 2 - 12, h - 16);
      ctx.strokeRect(w / 2 + 4, 8, w / 2 - 12, h - 16);
      ctx.fillStyle = "#8a8f98";
      ctx.fillRect(w / 2 - 22, h / 2 - 20, 6, 40);
      ctx.fillRect(w / 2 + 16, h / 2 - 20, 6, 40);
    }, 256, 256);
    return { piso, parede, tapete, quadro, ceu, madeira, tecido, tela, concreto, arte1, arte2, grafico, calendario, armario };
  }, [escuro]);
}

type Texturas = ReturnType<typeof useTexturas>;

function Cadeira({ cor, tecido }: { cor: string; tecido: Texturas["tecido"] }) {
  return (
    <group>
      <RoundedBox args={[0.55, 0.08, 0.55]} radius={0.03} position={[0, 0.48, 0]}>
        <meshStandardMaterial color={cor} map={tecido} roughness={0.85} />
      </RoundedBox>
      <RoundedBox args={[0.55, 0.55, 0.07]} radius={0.03} position={[0, 0.8, 0.26]}>
        <meshStandardMaterial color={cor} map={tecido} roughness={0.85} />
      </RoundedBox>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.46, 8]} />
        <meshStandardMaterial color="#3a3a40" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.28, 16]} />
        <meshStandardMaterial color="#2a2a2e" />
      </mesh>
    </group>
  );
}

function Mesa({ agente, tarefa, erro, texturas }: { agente: AgenteId; tarefa: string; erro: boolean; texturas: Texturas }) {
  const [x, z] = MESAS[agente];
  const cor = useConfig((s) => s.agentes.aparencias[agente].cor);
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[1.9, 0.07, 0.95]} radius={0.02} position={[0, 0.74, 0]}>
        <meshStandardMaterial map={texturas.madeira} roughness={0.5} />
      </RoundedBox>
      {[[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.37, pz]}>
          <boxGeometry args={[0.05, 0.74, 0.05]} />
          <meshStandardMaterial color="#5b4636" />
        </mesh>
      ))}
      <RoundedBox args={[0.98, 0.6, 0.04]} radius={0.02} position={[0, 1.16, -0.28]}>
        <meshStandardMaterial color="#141416" roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 1.16, -0.255]}>
        <planeGeometry args={[0.9, 0.52]} />
        {erro ? <meshStandardMaterial color="#f4505e" emissive="#f4505e" emissiveIntensity={0.5} /> : <meshStandardMaterial map={texturas.tela} emissive="#ffffff" emissiveMap={texturas.tela} emissiveIntensity={tarefa ? 0.9 : 0.45} />}
      </mesh>
      <mesh position={[0, 0.86, -0.28]}>
        <boxGeometry args={[0.08, 0.2, 0.08]} />
        <meshStandardMaterial color="#2a2a2e" />
      </mesh>
      <RoundedBox args={[0.6, 0.025, 0.2]} radius={0.01} position={[-0.05, 0.79, 0.12]}>
        <meshStandardMaterial color="#e8e8ea" />
      </RoundedBox>
      <mesh position={[0.42, 0.79, 0.14]}>
        <boxGeometry args={[0.08, 0.025, 0.12]} />
        <meshStandardMaterial color="#e8e8ea" />
      </mesh>
      <mesh position={[-0.72, 0.84, 0.15]}>
        <cylinderGeometry args={[0.055, 0.05, 0.12, 14]} />
        <meshStandardMaterial color={cor} />
      </mesh>
      <group position={[0.75, 0.78, -0.2]}>
        <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.4]}>
          <cylinderGeometry args={[0.012, 0.012, 0.42, 6]} />
          <meshStandardMaterial color="#2a2a2e" />
        </mesh>
        <mesh position={[-0.08, 0.42, 0]} rotation={[0, 0, -0.9]}>
          <coneGeometry args={[0.08, 0.12, 16, 1, true]} />
          <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={0.25} side={2} />
        </mesh>
      </group>
      {tarefa && <TextoMonitor texto={tarefa} />}
      <group position={[0, 0, 0.85]} rotation={[0, Math.PI, 0]}>
        <Cadeira cor={cor} tecido={texturas.tecido} />
      </group>
      <pointLight position={[0.62, 1.12, -0.12]} intensity={1.6} distance={2.2} decay={2} color="#ffd9a0" />
      <ItensDaMesa agente={agente} texturas={texturas} />
      <mesh position={[0.78, 0.17, 0.25]}>
        <cylinderGeometry args={[0.13, 0.11, 0.34, 14, 1, true]} />
        <meshStandardMaterial color="#4b5160" side={2} />
      </mesh>
    </group>
  );
}

function ItensDaMesa({ agente, texturas }: { agente: AgenteId; texturas: Texturas }) {
  if (agente === "organizador")
    return (
      <>
        <group position={[-0.62, 0.78, -0.2]} rotation={[-0.35, 0.35, 0]}>
          <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.24, 0.24, 0.02]} /><meshStandardMaterial map={texturas.calendario} /></mesh>
        </group>
        {["#fde68a", "#fbcfe8", "#bbf7d0"].map((c, i) => (
          <mesh key={c} position={[0.52 - i * 0.06, 1.3 - i * 0.09, -0.256]} rotation={[0, 0, (i - 1) * 0.12]}>
            <planeGeometry args={[0.08, 0.08]} />
            <meshStandardMaterial color={c} />
          </mesh>
        ))}
        <group position={[0.3, 0.78, 0.3]}>
          <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.06, 0.05, 0.08, 12]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={i} position={[Math.cos(i * 1.3) * 0.03, 0.11, Math.sin(i * 1.3) * 0.03]} rotation={[Math.cos(i) * 0.4, 0, Math.sin(i) * 0.4]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshStandardMaterial color="#4f9d69" />
            </mesh>
          ))}
        </group>
      </>
    );
  if (agente === "tutor")
    return (
      <>
        {["#3b6fe0", "#d9922b", "#2f9e6b", "#8b5cf6"].map((c, i) => (
          <mesh key={c} position={[-0.6, 0.8 + i * 0.045, 0.12]} rotation={[0, i * 0.18, 0]}>
            <boxGeometry args={[0.3, 0.04, 0.22]} />
            <meshStandardMaterial color={c} roughness={0.8} />
          </mesh>
        ))}
        <group position={[0.42, 0.78, -0.25]}>
          <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.06, 0.07, 0.04, 14]} /><meshStandardMaterial color="#5b4636" /></mesh>
          <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.008, 0.008, 0.1, 6]} /><meshStandardMaterial color="#c9a227" metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, 0.2, 0]}><sphereGeometry args={[0.1, 20, 16]} /><meshStandardMaterial color="#4aa3df" roughness={0.6} /></mesh>
          <mesh position={[0.02, 0.23, 0.05]}><sphereGeometry args={[0.05, 10, 8]} /><meshStandardMaterial color="#5fbf7a" roughness={0.8} /></mesh>
        </group>
        <group position={[0.3, 0.78, 0.3]}>
          <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.04, 0.04, 0.1, 12]} /><meshStandardMaterial color="#1c1c1e" /></mesh>
          {["#f5a524", "#d84b4b", "#3b6fe0"].map((c, i) => (
            <mesh key={c} position={[(i - 1) * 0.015, 0.13, 0]} rotation={[0, 0, (i - 1) * 0.15]}>
              <cylinderGeometry args={[0.006, 0.006, 0.14, 6]} />
              <meshStandardMaterial color={c} />
            </mesh>
          ))}
        </group>
      </>
    );
  if (agente === "java")
    return (
      <>
        <group position={[-0.72, 1.12, -0.2]} rotation={[0, 0.4, 0]}>
          <RoundedBox args={[0.58, 0.36, 0.03]} radius={0.01}><meshStandardMaterial color="#141416" /></RoundedBox>
          <mesh position={[0, 0, 0.017]}><planeGeometry args={[0.54, 0.32]} /><meshStandardMaterial map={texturas.tela} emissive="#ffffff" emissiveMap={texturas.tela} emissiveIntensity={0.75} /></mesh>
          <mesh position={[0, -0.24, -0.02]}><boxGeometry args={[0.05, 0.12, 0.05]} /><meshStandardMaterial color="#2a2a2e" /></mesh>
        </group>
        <group position={[0.42, 0.78, 0.26]} rotation={[0, -0.6, 0]}>
          <mesh position={[0, 0.06, 0]} scale={[1, 0.8, 1.15]}><sphereGeometry args={[0.07, 16, 12]} /><meshStandardMaterial color="#facc15" roughness={0.5} /></mesh>
          <mesh position={[0, 0.14, 0.04]}><sphereGeometry args={[0.045, 14, 12]} /><meshStandardMaterial color="#facc15" roughness={0.5} /></mesh>
          <mesh position={[0, 0.135, 0.09]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.018, 0.04, 10]} /><meshStandardMaterial color="#f97316" /></mesh>
          <mesh position={[0.02, 0.155, 0.075]}><sphereGeometry args={[0.007, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
          <mesh position={[-0.02, 0.155, 0.075]}><sphereGeometry args={[0.007, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
        </group>
        <group position={[-0.25, 0.78, 0.32]}>
          <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.045, 0.04, 0.1, 14]} /><meshStandardMaterial color="#5b8def" /></mesh>
          <mesh position={[0.05, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.025, 0.008, 6, 12, Math.PI]} /><meshStandardMaterial color="#5b8def" /></mesh>
          <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.038, 14]} /><meshStandardMaterial color="#3b2416" /></mesh>
        </group>
      </>
    );
  return (
    <>
      <group position={[-0.68, 1.12, -0.22]} rotation={[0, 0.35, 0]}>
        <RoundedBox args={[0.34, 0.52, 0.03]} radius={0.01}><meshStandardMaterial color="#141416" /></RoundedBox>
        <mesh position={[0, 0, 0.017]}><planeGeometry args={[0.3, 0.47]} /><meshStandardMaterial map={texturas.grafico} emissive="#ffffff" emissiveMap={texturas.grafico} emissiveIntensity={0.7} /></mesh>
        <mesh position={[0, -0.32, -0.02]}><boxGeometry args={[0.05, 0.14, 0.05]} /><meshStandardMaterial color="#2a2a2e" /></mesh>
      </group>
      <group position={[0.35, 0.82, 0.28]} rotation={[0, -0.4, 0]}>
        <mesh rotation={[0, 0, 0]}><torusGeometry args={[0.09, 0.015, 8, 20, Math.PI]} /><meshStandardMaterial color="#1c1c1e" /></mesh>
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}><cylinderGeometry args={[0.04, 0.04, 0.03, 14]} /><meshStandardMaterial color="#ffc20e" /></mesh>
        ))}
      </group>
      <RoundedBox args={[0.22, 0.48, 0.46]} radius={0.02} position={[-0.7, 0.24, 0.05]}>
        <meshStandardMaterial color="#1f2229" metalness={0.2} roughness={0.5} />
      </RoundedBox>
      <mesh position={[-0.588, 0.36, 0.05]}><planeGeometry args={[0.02, 0.2]} /><meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={1.2} /></mesh>
    </>
  );
}

function Cenario({ texturas, escuro }: { texturas: Texturas; escuro: boolean }) {
  const corParede = escuro ? "#2b2e36" : "#d9d4ca";
  return (
    <>
      <mesh position={[0.1, -0.16, 0.1]}>
        <boxGeometry args={[12.4, 0.3, 8.4]} />
        <meshStandardMaterial map={texturas.concreto} roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.5, -4.1]}>
        <boxGeometry args={[12.2, 3.02, 0.2]} />
        <meshStandardMaterial color={corParede} />
      </mesh>
      <mesh position={[-6.1, 1.5, 0]}>
        <boxGeometry args={[0.2, 3.02, 8.4]} />
        <meshStandardMaterial color={corParede} />
      </mesh>
      <mesh position={[0, 3.02, -4.1]}><boxGeometry args={[12.24, 0.05, 0.24]} /><meshStandardMaterial color={escuro ? "#3a3e48" : "#f4f1ea"} /></mesh>
      <mesh position={[-6.1, 3.02, 0]}><boxGeometry args={[0.24, 0.05, 8.44]} /><meshStandardMaterial color={escuro ? "#3a3e48" : "#f4f1ea"} /></mesh>
      <group position={[-5.95, 0, -2.5]}>
        <mesh position={[0, 1.05, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[1.05, 2.1, 0.06]} /><meshStandardMaterial map={texturas.madeira} color="#b58a5f" /></mesh>
        {[-0.56, 0.56].map((dz) => (
          <mesh key={dz} position={[0.02, 1.08, dz]}><boxGeometry args={[0.08, 2.16, 0.08]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
        ))}
        <mesh position={[0.02, 2.17, 0]}><boxGeometry args={[0.08, 0.08, 1.2]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
        <mesh position={[0.06, 1.0, 0.36]}><sphereGeometry args={[0.04, 10, 10]} /><meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.25} /></mesh>
      </group>
      {[-1, 1].map((lado) => (
        <RoundedBox key={lado} args={[0.12, 1.75, 0.5]} radius={0.04} position={[-5.86, 1.62, 1 + lado * 1.48]}>
          <meshStandardMaterial color={escuro ? "#6d5a86" : "#c9b8e8"} map={texturas.tecido} roughness={1} />
        </RoundedBox>
      ))}
      <mesh position={[-5.86, 2.55, 1]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.02, 0.02, 3.6, 8]} /><meshStandardMaterial color="#2a2a2e" /></mesh>
      <mesh position={[-5.8, 0.98, 1]}><boxGeometry args={[0.25, 0.05, 2.6]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
      <Planta posicao={[-5.75, 1.0, 0.3]} tamanho={0.35} tipo={1} />
      <group position={[3, 2.15, -3.9]}>
        <mesh><boxGeometry args={[1.6, 0.05, 0.3]} /><meshStandardMaterial map={texturas.madeira} /></mesh>
        <Planta posicao={[-0.55, 0.03, 0]} tamanho={0.3} />
        {["#e7e5df", "#cfc8bb", "#f2b84b"].map((c, i) => (
          <mesh key={c} position={[0.1 + i * 0.22, 0.13, 0]}><boxGeometry args={[0.18, 0.2 + i * 0.03, 0.2]} /><meshStandardMaterial color={c} /></mesh>
        ))}
      </group>
      {([[3.8, 1.95, texturas.arte1, 0.7, 0.88], [-0.95, 2.05, texturas.arte2, 0.6, 0.76]] as const).map(([x, y, mapa, w, h], i) => (
        <group key={i} position={[x, y, -3.97]}>
          <mesh><boxGeometry args={[w + 0.08, h + 0.08, 0.04]} /><meshStandardMaterial color={i ? "#c9a227" : "#1c1c1e"} metalness={i ? 0.5 : 0} roughness={0.4} /></mesh>
          <mesh position={[0, 0, 0.025]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={mapa} /></mesh>
        </group>
      ))}
      <group position={[-1.6, 0, 2.6]}>
        <RoundedBox args={[0.5, 0.5, 0.5]} radius={0.05} position={[0, 0.25, 0]}><meshStandardMaterial map={texturas.madeira} /></RoundedBox>
        <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.05, 0.08, 0.22, 12]} /><meshStandardMaterial color="#1c1c1e" /></mesh>
        <mesh position={[0, 0.83, 0]}><cylinderGeometry args={[0.13, 0.18, 0.2, 18, 1, true]} /><meshStandardMaterial color="#f4ead2" emissive="#ffd9a0" emissiveIntensity={escuro ? 0.9 : 0.3} side={2} /></mesh>
        <pointLight position={[0, 0.85, 0]} intensity={escuro ? 2.2 : 0.8} distance={3} decay={2} color="#ffd9a0" />
      </group>
      <group position={[-3.2, 0.02, 1.9]} rotation={[0, 0.6, 0]}>
        <mesh position={[0, 0.07, 0]} scale={[1, 0.55, 1.3]}><sphereGeometry args={[0.16, 16, 12]} /><meshStandardMaterial color="#f2b84b" roughness={0.9} /></mesh>
        <mesh position={[0, 0.12, 0.2]}><sphereGeometry args={[0.09, 14, 12]} /><meshStandardMaterial color="#f2b84b" roughness={0.9} /></mesh>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position={[x, 0.2, 0.22]} rotation={[0, 0, x > 0 ? -0.3 : 0.3]}><coneGeometry args={[0.03, 0.06, 6]} /><meshStandardMaterial color="#e3a43a" /></mesh>
        ))}
        <mesh position={[0.12, 0.04, -0.12]} rotation={[0, 0.8, Math.PI / 2]}><torusGeometry args={[0.1, 0.025, 8, 16, Math.PI]} /><meshStandardMaterial color="#f2b84b" /></mesh>
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.32, 20]} /><meshStandardMaterial color={escuro ? "#4b4466" : "#e9dccb"} /></mesh>
      </group>
      <group position={[4.95, 0, 2.4]}>
        <mesh position={[0.31, 0.45, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.6, 0.9]} /><meshStandardMaterial map={texturas.armario} /></mesh>
        <mesh position={[0, 0.92, 0]}><boxGeometry args={[0.95, 0.04, 0.64]} /><meshStandardMaterial map={texturas.madeira} /></mesh>
      </group>
    </>
  );
}

function Sombras() {
  const cena = useThree((s) => s.scene);
  const invalidar = useThree((s) => s.invalidate);
  useEffect(() => {
    const t = window.setTimeout(() => {
      cena.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.castShadow = !(m.material as { transparent?: boolean }).transparent;
        m.receiveShadow = true;
      });
      invalidar();
    }, 50);
    return () => window.clearTimeout(t);
  }, [cena, invalidar]);
  return null;
}

function Estante() {
  const livros = useMemo(() => {
    const r = semente(31);
    const cores = ["#3b6fe0", "#d84b4b", "#2f9e6b", "#d9922b", "#8b5cf6", "#e05a8a", "#0ea5a4", "#64748b"];
    return Array.from({ length: 3 }, (_, prateleira) => {
      let x = -0.75;
      const lista: { x: number; w: number; h: number; cor: string; inclinado: boolean }[] = [];
      while (x < 0.7) {
        const w = 0.06 + r() * 0.05;
        lista.push({ x: x + w / 2, w, h: 0.26 + r() * 0.12, cor: cores[Math.floor(r() * cores.length)], inclinado: r() > 0.9 });
        x += w + 0.01;
      }
      return { y: 0.35 + prateleira * 0.5, lista };
    });
  }, []);
  return (
    <group position={[-2.6, 0, -3.65]}>
      <RoundedBox args={[1.8, 1.7, 0.4]} radius={0.02} position={[0, 0.85, 0]}>
        <meshStandardMaterial color="#8b6a4b" roughness={0.6} />
      </RoundedBox>
      {livros.map((p, i) => (
        <group key={i}>
          <mesh position={[0, p.y - 0.06, 0.06]}>
            <boxGeometry args={[1.7, 0.03, 0.34]} />
            <meshStandardMaterial color="#6b513a" />
          </mesh>
          {p.lista.map((l, j) => (
            <group key={j} position={[l.x, p.y - 0.045 + l.h / 2, 0.08]} rotation={[0, 0, l.inclinado ? 0.25 : 0]}>
              <mesh>
                <boxGeometry args={[l.w, l.h, 0.24]} />
                <meshStandardMaterial color={l.cor} roughness={0.8} />
              </mesh>
              {[0.32, -0.32].map((dy) => (
                <mesh key={dy} position={[0, l.h * dy, 0.121]}>
                  <planeGeometry args={[l.w * 0.8, 0.012]} />
                  <meshStandardMaterial color="#f5e6b8" />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function Relogio() {
  const [agora, setAgora] = useState(new Date());
  const invalidar = useThree((s) => s.invalidate);
  useEffect(() => {
    const t = window.setInterval(() => {
      setAgora(new Date());
      invalidar();
    }, 30000);
    return () => window.clearInterval(t);
  }, [invalidar]);
  const h = ((agora.getHours() % 12) + agora.getMinutes() / 60) * (Math.PI / 6);
  const m = agora.getMinutes() * (Math.PI / 30);
  return (
    <group position={[2.2, 2.35, -3.92]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.05, 32]} />
        <meshStandardMaterial color="#1c1c1e" />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[0.28, 32]} />
        <meshStandardMaterial color="#fbfbf8" />
      </mesh>
      <mesh position={[Math.sin(h) * 0.07, Math.cos(h) * 0.07, 0.04]} rotation={[0, 0, -h]}>
        <boxGeometry args={[0.025, 0.15, 0.01]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[Math.sin(m) * 0.1, Math.cos(m) * 0.1, 0.045]} rotation={[0, 0, -m]}>
        <boxGeometry args={[0.018, 0.21, 0.01]} />
        <meshStandardMaterial color="#d84b4b" />
      </mesh>
    </group>
  );
}

function Planta({ posicao, tamanho = 1, tipo = 0 }: { posicao: [number, number, number]; tamanho?: number; tipo?: number }) {
  return (
    <group position={posicao} scale={tamanho}>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.24, 0.18, 0.44, 16]} />
        <meshStandardMaterial color={tipo ? "#e8e4dc" : "#b45f3c"} roughness={0.8} />
      </mesh>
      {tipo === 0 ? (
        <>
          <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.42, 14, 14]} /><meshStandardMaterial color="#2f9e6b" roughness={0.9} /></mesh>
          <mesh position={[0.2, 1.08, 0.1]}><sphereGeometry args={[0.26, 12, 12]} /><meshStandardMaterial color="#38b27a" roughness={0.9} /></mesh>
        </>
      ) : (
        Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[Math.cos(i) * 0.08, 0.75, Math.sin(i) * 0.08]} rotation={[Math.cos(i * 1.7) * 0.5, i, Math.sin(i * 1.3) * 0.5]}>
            <coneGeometry args={[0.07, 0.8, 6]} />
            <meshStandardMaterial color="#2d7a4f" />
          </mesh>
        ))
      )}
    </group>
  );
}

function Moveis({ texturas, escuro }: { texturas: Texturas; escuro: boolean }) {
  const [sx, sz] = LUGARES.sofa;
  const [cx, cz] = LUGARES.cafe;
  const tecido = escuro ? "#6b7f99" : "#6b7f99";
  const tecido2 = "#5c6f88";
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sx + 0.3, 0.005, sz - 0.4]}>
        <planeGeometry args={[3, 2]} />
        <meshStandardMaterial map={texturas.tapete} roughness={1} />
      </mesh>
      <group position={[sx, 0, sz + 0.65]}>
        <RoundedBox args={[2.3, 0.42, 0.85]} radius={0.08} position={[0, 0.3, 0]}><meshStandardMaterial color={tecido} map={texturas.tecido} roughness={0.95} /></RoundedBox>
        <RoundedBox args={[2.3, 0.62, 0.2]} radius={0.08} position={[0, 0.66, 0.34]}><meshStandardMaterial color={tecido2} map={texturas.tecido} roughness={0.95} /></RoundedBox>
        <RoundedBox args={[0.2, 0.5, 0.85]} radius={0.06} position={[-1.15, 0.45, 0]}><meshStandardMaterial color={tecido2} map={texturas.tecido} /></RoundedBox>
        <RoundedBox args={[0.2, 0.5, 0.85]} radius={0.06} position={[1.15, 0.45, 0]}><meshStandardMaterial color={tecido2} map={texturas.tecido} /></RoundedBox>
        <RoundedBox args={[0.45, 0.35, 0.12]} radius={0.06} position={[-0.6, 0.66, 0.18]} rotation={[-0.2, 0.2, 0]}><meshStandardMaterial color="#d9922b" /></RoundedBox>
        <RoundedBox args={[0.45, 0.35, 0.12]} radius={0.06} position={[0.6, 0.66, 0.18]} rotation={[-0.2, -0.2, 0]}><meshStandardMaterial color="#e05a8a" /></RoundedBox>
      </group>
      <group position={[sx + 0.2, 0, sz - 0.6]}>
        <RoundedBox args={[1, 0.06, 0.55]} radius={0.02} position={[0, 0.4, 0]}><meshStandardMaterial map={texturas.madeira} /></RoundedBox>
        {[[-0.42, -0.2], [0.42, -0.2], [-0.42, 0.2], [0.42, 0.2]].map(([px, pz], i) => (
          <mesh key={i} position={[px, 0.2, pz]}><boxGeometry args={[0.04, 0.4, 0.04]} /><meshStandardMaterial color="#5b4636" /></mesh>
        ))}
        <mesh position={[0.2, 0.47, 0]}><boxGeometry args={[0.3, 0.06, 0.22]} /><meshStandardMaterial color="#3b6fe0" /></mesh>
        <mesh position={[-0.25, 0.48, 0.05]}><cylinderGeometry args={[0.05, 0.045, 0.1, 12]} /><meshStandardMaterial color="#fbfbf8" /></mesh>
      </group>
      <group position={[cx + 0.75, 0, cz]}>
        <RoundedBox args={[0.9, 0.9, 0.6]} radius={0.03} position={[0, 0.45, 0]}><meshStandardMaterial color="#e7e7e5" /></RoundedBox>
        <RoundedBox args={[0.42, 0.34, 0.38]} radius={0.04} position={[-0.15, 1.07, 0]}><meshStandardMaterial color="#2a2a2e" metalness={0.3} roughness={0.4} /></RoundedBox>
        <mesh position={[0.25, 0.98, 0.05]}><cylinderGeometry args={[0.05, 0.045, 0.1, 12]} /><meshStandardMaterial color="#d84b4b" /></mesh>
        <mesh position={[0.25, 0.98, -0.12]}><cylinderGeometry args={[0.05, 0.045, 0.1, 12]} /><meshStandardMaterial color="#3b6fe0" /></mesh>
      </group>
      <group position={[5.3, 0, 0.6]}>
        <RoundedBox args={[0.42, 0.95, 0.42]} radius={0.04} position={[0, 0.48, 0]}><meshStandardMaterial color="#fbfbf8" /></RoundedBox>
        <mesh position={[0, 1.22, 0]}><cylinderGeometry args={[0.17, 0.17, 0.5, 16]} /><meshStandardMaterial color="#9fd4ff" transparent opacity={0.7} /></mesh>
      </group>
      <Planta posicao={[5.2, 0, -3.3]} />
      <Planta posicao={[-5.4, 0, -3.3]} tipo={1} />
      <Planta posicao={[-1.3, 0, 3.3]} tamanho={0.7} tipo={1} />
      <Estante />
      <mesh position={[0.4, 1.75, -3.94]}>
        <boxGeometry args={[2.7, 1.4, 0.05]} />
        <meshStandardMaterial color="#c9c9c9" />
      </mesh>
      <mesh position={[0.4, 1.75, -3.91]}>
        <planeGeometry args={[2.55, 1.25]} />
        <meshStandardMaterial map={texturas.quadro} />
      </mesh>
      <Relogio />
      <group position={[-5.94, 1.75, 1]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[2.4, 1.4]} />
          <meshStandardMaterial map={texturas.ceu} emissive="#ffffff" emissiveMap={texturas.ceu} emissiveIntensity={escuro ? 0.6 : 0.35} />
        </mesh>
        {[-1.25, 1.25].map((dz, i) => (
          <mesh key={i} position={[0.02, 0, dz]}><boxGeometry args={[0.08, 1.52, 0.08]} /><meshStandardMaterial color="#fbfbf8" /></mesh>
        ))}
        {[-0.74, 0.74].map((dy, i) => (
          <mesh key={i} position={[0.02, dy, 0]}><boxGeometry args={[0.08, 0.08, 2.58]} /><meshStandardMaterial color="#fbfbf8" /></mesh>
        ))}
        <mesh position={[0.02, 0, 0]}><boxGeometry args={[0.05, 1.4, 0.05]} /><meshStandardMaterial color="#fbfbf8" /></mesh>
      </group>
      <group position={[4.6, 0, 2.9]}>
        <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.02, 0.02, 1.6, 8]} /><meshStandardMaterial color="#2a2a2e" /></mesh>
        <mesh position={[0, 1.65, 0]}><coneGeometry args={[0.25, 0.3, 20, 1, true]} /><meshStandardMaterial color="#fbfbf8" emissive="#ffe8b0" emissiveIntensity={escuro ? 0.8 : 0.2} side={2} /></mesh>
      </group>
      <mesh position={[-4.6, 0.18, -1.6]}><cylinderGeometry args={[0.16, 0.13, 0.36, 14]} /><meshStandardMaterial color="#64748b" /></mesh>
    </>
  );
}

function AgenteNaCena({ agente, c, registrar }: { agente: AgenteId; c: Comportamento; registrar: (a: AgenteId, g: Group | null) => void }) {
  const grupo = useRef<Group>(null);
  useEffect(() => {
    registrar(agente, grupo.current);
    return () => registrar(agente, null);
  }, [agente, registrar]);
  const invalidar = useThree((s) => s.invalidate);
  const fase = useRef(0);

  const inicioPulo = useRef(0);

  useEffect(() => {
    if (c.estado === "sucesso") inicioPulo.current = performance.now();
    invalidar();
  }, [c.alvo[0], c.alvo[1], c.acao, c.estado, invalidar]);

  useFrame((_, dt) => {
    const g = grupo.current;
    if (!g) return;
    const [tx, tz] = c.alvo;
    const dx = tx - g.position.x;
    const dz = tz - g.position.z;
    const distancia = Math.hypot(dx, dz);
    const tempoPulo = (performance.now() - inicioPulo.current) / 1000;
    if (distancia > 0.01) {
      const passo = Math.min(distancia, dt * 1.4);
      g.position.x += (dx / distancia) * passo;
      g.position.z += (dz / distancia) * passo;
      fase.current += dt * 7;
      g.position.y = Math.abs(Math.sin(fase.current)) * 0.03;
      invalidar();
    } else if (tempoPulo < 0.5) {
      g.position.y = Math.sin((tempoPulo / 0.5) * Math.PI) * 0.18;
      invalidar();
    } else if (g.position.y !== 0) {
      g.position.y = 0;
      fase.current = 0;
      invalidar();
    }
  });

  return (
    <group ref={grupo} position={[MESAS[agente][0], 0, MESAS[agente][1] + 0.9]}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.35, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

export default function Cena3D({ comportamento, tarefas, aoEscolher, escuro }: Props) {
  const texturas = useTexturas(escuro);
  const api = useRef<ApiCamera | null>(null);
  const grupos = useRef<Partial<Record<AgenteId, Group>>>({});
  const camadas = useRef<Partial<Record<AgenteId, HTMLDivElement>>>({});
  const registrar = useCallback((a: AgenteId, g: Group | null) => {
    if (g) grupos.current[a] = g;
    else delete grupos.current[a];
  }, []);
  return (
    <div className="cena-3d">
      <Canvas frameloop="demand" shadows={{ type: PCFShadowMap }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}>
        <Controles api={api} />
        <ambientLight intensity={escuro ? 0.35 : 0.5} />
        <hemisphereLight args={[escuro ? "#c9d3ff" : "#ffffff", escuro ? "#3a2f26" : "#d8c2a3", escuro ? 0.8 : 0.9]} />
        <directionalLight
          position={[7, 11, 6]}
          intensity={escuro ? 0.9 : 1.7}
          color={escuro ? "#c8d4ff" : "#fff4e2"}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
        <pointLight position={[-5.1, 1.8, 1]} intensity={escuro ? 2.5 : 5} distance={6} decay={1.6} color={escuro ? "#8fa8ff" : "#cfe6ff"} />
        <pointLight position={[0, 2.6, 0.5]} intensity={escuro ? 3 : 1.2} distance={9} decay={1.4} color="#ffe2b8" />
        <Sombras />
        <Cenario texturas={texturas} escuro={escuro} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 8]} />
        <meshStandardMaterial map={texturas.piso} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.5, -4]}>
        <boxGeometry args={[12, 3, 0.1]} />
        <meshStandardMaterial map={texturas.parede} />
      </mesh>
      <mesh position={[-6, 1.5, 0]}>
        <boxGeometry args={[0.1, 3, 8]} />
        <meshStandardMaterial map={texturas.parede} />
      </mesh>
      {AGENTES.map((a) => <Mesa key={a} agente={a} tarefa={tarefas[a]} erro={comportamento[a].estado === "erro"} texturas={texturas} />)}
      <Moveis texturas={texturas} escuro={escuro} />
        {AGENTES.map((a) => <AgenteNaCena key={a} agente={a} c={comportamento[a]} registrar={registrar} />)}
        <Projetor grupos={grupos} camadas={camadas} />
      </Canvas>
      <div className="cena-sobreposicao">
        {AGENTES.map((a) => (
          <div key={a} className="cena-agente" ref={(el) => { if (el) camadas.current[a] = el; else delete camadas.current[a]; }}>
            <div className="agente-cena">
              <Pensamento agente={a} c={comportamento[a]} tarefa={tarefas[a]} />
              <div onClick={() => aoEscolher(a)}>
                <Personagem agente={a} tamanho={72} estado={comportamento[a].estado} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="cena-controles" role="group" aria-label={T.escritorio.camera}>
        <button type="button" aria-label={T.escritorio.aproximar} title={T.escritorio.aproximar} onClick={() => api.current?.zoom(1.25)}><Plus size={15} /></button>
        <button type="button" aria-label={T.escritorio.afastar} title={T.escritorio.afastar} onClick={() => api.current?.zoom(0.8)}><Minus size={15} /></button>
        <button type="button" aria-label={T.escritorio.centralizar} title={T.escritorio.centralizar} onClick={() => api.current?.centralizar()}><Maximize2 size={14} /></button>
      </div>
    </div>
  );
}

interface ApiCamera {
  zoom: (fator: number) => void;
  centralizar: () => void;
}

const AZIMUTE = Math.PI / 4;

function Controles({ api }: { api: React.RefObject<ApiCamera | null> }) {
  const tamanho = useThree((s) => s.size);
  const invalidar = useThree((s) => s.invalidate);
  const camera = useRef<ThreeOrtho>(null);
  const controles = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const base = Math.max(20, Math.min(tamanho.width / 14.2, tamanho.height / 10.4));
  const relativo = useRef(1);

  useEffect(() => {
    const c = camera.current;
    if (!c) return;
    c.zoom = base * relativo.current;
    c.updateProjectionMatrix();
    invalidar();
  }, [base, invalidar]);

  useEffect(() => {
    const aplicar = (z: number) => {
      const c = camera.current;
      if (!c) return;
      const alvo = Math.min(base * 2.6, Math.max(base * 0.8, z));
      const inicio = c.zoom;
      const t0 = performance.now();
      const passo = (agora: number) => {
        const p = Math.min(1, (agora - t0) / 260);
        const suave = 1 - Math.pow(1 - p, 3);
        c.zoom = inicio + (alvo - inicio) * suave;
        c.updateProjectionMatrix();
        relativo.current = c.zoom / base;
        invalidar();
        if (p < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    };
    api.current = {
      zoom: (fator) => camera.current && aplicar(camera.current.zoom * fator),
      centralizar: () => {
        controles.current?.reset();
        aplicar(base);
      },
    };
  }, [api, base, invalidar]);

  return (
    <>
      <OrthographicCamera ref={camera} makeDefault position={[10, 9.2, 10]} zoom={base} near={0.1} far={100} />
      <OrbitControls
        ref={controles}
        target={[0, 0.9, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minZoom={base * 0.8}
        maxZoom={base * 2.6}
        minPolarAngle={0.65}
        maxPolarAngle={1.12}
        minAzimuthAngle={AZIMUTE - 0.38}
        maxAzimuthAngle={AZIMUTE + 0.38}
        onChange={() => {
          if (camera.current) relativo.current = camera.current.zoom / base;
        }}
      />
    </>
  );
}

const PONTO = new Vector3();

function Projetor({ grupos, camadas }: { grupos: React.RefObject<Partial<Record<AgenteId, Group>>>; camadas: React.RefObject<Partial<Record<AgenteId, HTMLDivElement>>> }) {
  useFrame(({ camera, size }) => {
    const escala = (camera as ThreeOrtho).zoom * 0.0135;
    for (const a of AGENTES) {
      const g = grupos.current[a];
      const el = camadas.current[a];
      if (!g || !el) continue;
      g.updateWorldMatrix(true, false);
      PONTO.setFromMatrixPosition(g.matrixWorld);
      PONTO.y += 1.05;
      PONTO.project(camera);
      const x = ((PONTO.x + 1) / 2) * size.width;
      const y = ((1 - PONTO.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${escala.toFixed(3)})`;
      el.style.zIndex = String(Math.round((1 - PONTO.z) * 1000));
      el.style.visibility = "visible";
    }
  });
  return null;
}

function TextoMonitor({ texto }: { texto: string }) {
  const mapa = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 208;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(10, 14, 22, 0.92)";
      ctx.fillRect(0, 0, 360, 208);
      ctx.fillStyle = "#34d399";
      ctx.font = "600 22px 'IBM Plex Mono', monospace";
      ctx.fillText("> ", 18, 48);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "500 22px 'IBM Plex Mono', monospace";
      const palavras = texto.split(/\s+/);
      let linha = "";
      let y = 48;
      for (const p of palavras) {
        const teste = linha ? `${linha} ${p}` : p;
        if (ctx.measureText(teste).width > 300 && linha) {
          ctx.fillText(linha, 44, y);
          linha = p;
          y += 32;
          if (y > 180) break;
        } else linha = teste;
      }
      if (y <= 180) ctx.fillText(linha, 44, y);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [texto]);
  useEffect(() => () => mapa.dispose(), [mapa]);
  return (
    <mesh position={[0, 1.16, -0.252]}>
      <planeGeometry args={[0.9, 0.52]} />
      <meshBasicMaterial map={mapa} transparent toneMapped={false} />
    </mesh>
  );
}
