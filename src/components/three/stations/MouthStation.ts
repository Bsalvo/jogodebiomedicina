/**
 * Estação Boca: modelo anatômico 3D completo da cavidade oral (maxila e mandíbula
 * com gengivas esculpidas em ferradura, eminências alveolares e festão gengival,
 * 28 dentes anatômicos contíguos diferenciados entre incisivos, caninos, pré-molares
 * e molares com fossas oclusais, abóbada palatina contínua, arcos palatoglosso e
 * palatofaríngeo com úvula central arredondada, faringe descendente e língua com
 * sulco mediano). A cada mastigada as arcadas ocluem, o alimento é triturado sobre
 * a língua com gotas de saliva e forma o bolo alimentar.
 */
import * as THREE from 'three';
import type { Proposta1HD2DSceneProps } from '../Proposta1HD2DScene3D';
import type { StationBuildContext, StationInstance } from './types';
import {
  ALIMENTO,
  COR,
  Gotas,
  Impulso,
  aplicarCorAlimento,
  esfera,
  materialMacio,
  pulso,
  suave
} from './anatomia';

const CENTRO_Y = 0.95;
const MASTIGADAS = 5;

type TipoDente =
  | 'incisivo_central'
  | 'incisivo_lateral'
  | 'canino'
  | 'premolar1'
  | 'premolar2'
  | 'molar1'
  | 'molar2';

interface SpecDente {
  tipo: TipoDente;
  largura: number;
  espessura: number;
  altura: number;
  bulgeRaiz: number;
}

interface DentePosicionado extends SpecDente {
  escalaLargura: number;
  sCentro: number;
  sMeiaLargura: number;
  pos: THREE.Vector3;
  tangente: THREE.Vector3;
  normal: THREE.Vector3;
}

const DENTES_SUP: SpecDente[] = [
  { tipo: 'incisivo_central', largura: 0.102, espessura: 0.064, altura: 0.086, bulgeRaiz: 0.017 },
  { tipo: 'incisivo_lateral', largura: 0.084, espessura: 0.060, altura: 0.079, bulgeRaiz: 0.015 },
  { tipo: 'canino', largura: 0.090, espessura: 0.070, altura: 0.088, bulgeRaiz: 0.019 },
  { tipo: 'premolar1', largura: 0.092, espessura: 0.088, altura: 0.074, bulgeRaiz: 0.016 },
  { tipo: 'premolar2', largura: 0.094, espessura: 0.092, altura: 0.072, bulgeRaiz: 0.015 },
  { tipo: 'molar1', largura: 0.114, espessura: 0.106, altura: 0.068, bulgeRaiz: 0.015 },
  { tipo: 'molar2', largura: 0.108, espessura: 0.102, altura: 0.064, bulgeRaiz: 0.013 }
];

const DENTES_INF: SpecDente[] = [
  { tipo: 'incisivo_central', largura: 0.070, espessura: 0.056, altura: 0.072, bulgeRaiz: 0.016 },
  { tipo: 'incisivo_lateral', largura: 0.076, espessura: 0.058, altura: 0.075, bulgeRaiz: 0.016 },
  { tipo: 'canino', largura: 0.086, espessura: 0.068, altura: 0.082, bulgeRaiz: 0.020 },
  { tipo: 'premolar1', largura: 0.088, espessura: 0.082, altura: 0.072, bulgeRaiz: 0.016 },
  { tipo: 'premolar2', largura: 0.092, espessura: 0.086, altura: 0.070, bulgeRaiz: 0.015 },
  { tipo: 'molar1', largura: 0.114, espessura: 0.102, altura: 0.066, bulgeRaiz: 0.015 },
  { tipo: 'molar2', largura: 0.108, espessura: 0.098, altura: 0.063, bulgeRaiz: 0.013 }
];

/**
 * Garante que todas as faces da geometria apontem para fora em relação a um ponto interno de referência.
 */
function orientarFacesParaFora(geo: THREE.BufferGeometry, centroInterno: THREE.Vector3) {
  const idx = geo.getIndex();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  if (!idx || !pos) return;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centroFace = new THREE.Vector3();
  const dirFora = new THREE.Vector3();

  let somaDot = 0;
  const arr = idx.array as Uint16Array | Uint32Array;
  const passo = Math.max(3, Math.floor(arr.length / 90) * 3);
  for (let i = 0; i < arr.length; i += passo) {
    a.fromBufferAttribute(pos, arr[i]);
    b.fromBufferAttribute(pos, arr[i + 1]);
    c.fromBufferAttribute(pos, arr[i + 2]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    centroFace.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    dirFora.subVectors(centroFace, centroInterno);
    somaDot += normal.dot(dirFora);
  }

  if (somaDot < 0) {
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
  }
  geo.computeVertexNormals();
}

/**
 * Parametriza o arco dental em formato de ferradura (frente ampla nos incisivos/caninos
 * e ramos posteriores suaves nos pré-molares e molares).
 */
class ArcoDental {
  private readonly amostras = 240;
  private readonly sTab: number[] = [];
  private readonly compTab: number[] = [];
  readonly comprimentoMeioArco: number;

  constructor(
    readonly rx: number,
    readonly rz: number,
    readonly zTraseiro: number
  ) {
    this.sTab.push(0);
    this.compTab.push(0);
    let compAcum = 0;
    let ant = this.pontoBruto(0);
    for (let i = 1; i <= this.amostras; i++) {
      const u = i / this.amostras;
      const atual = this.pontoBruto(u);
      compAcum += atual.distanceTo(ant);
      this.sTab.push(u);
      this.compTab.push(compAcum);
      ant = atual;
    }
    this.comprimentoMeioArco = compAcum;
  }

  private pontoBruto(s: number): THREE.Vector3 {
    const u = Math.abs(s);
    const sinal = s < 0 ? -1 : 1;
    const theta = u * (Math.PI * 0.49);
    const x = sinal * this.rx * Math.pow(Math.sin(theta), 0.74);
    const z = this.zTraseiro + this.rz * Math.pow(Math.cos(theta), 0.88);
    return new THREE.Vector3(x, 0, z);
  }

  sPorDistancia(dist: number): number {
    const d = THREE.MathUtils.clamp(dist, 0, this.comprimentoMeioArco);
    for (let i = 1; i <= this.amostras; i++) {
      if (this.compTab[i] >= d) {
        const d0 = this.compTab[i - 1];
        const d1 = this.compTab[i];
        const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
        return THREE.MathUtils.lerp(this.sTab[i - 1], this.sTab[i], t);
      }
    }
    return 1;
  }

  amostrar(s: number): { pos: THREE.Vector3; tangente: THREE.Vector3; normal: THREE.Vector3 } {
    const eps = 0.002;
    const s0 = THREE.MathUtils.clamp(s - eps, -1, 1);
    const s1 = THREE.MathUtils.clamp(s + eps, -1, 1);
    const pos = this.pontoBruto(s);
    const p0 = this.pontoBruto(s0);
    const p1 = this.pontoBruto(s1);
    const tangente = p1.sub(p0).normalize();
    const normal = new THREE.Vector3(-tangente.z, 0, tangente.x).normalize();
    return { pos, tangente, normal };
  }

  posicionarDentes(specs: SpecDente[]): DentePosicionado[] {
    const somaLarguras = specs.reduce((acc, s) => acc + s.largura, 0);
    const escalaArco = (this.comprimentoMeioArco * 0.945) / somaLarguras;

    const resultado: DentePosicionado[] = [];
    for (const lado of [-1, 1] as const) {
      let cursorArco = 0.0;
      for (const spec of specs) {
        const passo = spec.largura * escalaArco;
        const escalaLargura = escalaArco * 1.045;
        const distCentro = cursorArco + passo * 0.5;
        const uCentro = this.sPorDistancia(distCentro);
        const uIni = this.sPorDistancia(cursorArco);
        const uFim = this.sPorDistancia(cursorArco + passo);
        const sCentro = lado * uCentro;
        const sMeiaLargura = Math.max(0.018, (uFim - uIni) * 0.5);
        const { pos, tangente, normal } = this.amostrar(sCentro);
        resultado.push({
          ...spec,
          escalaLargura,
          sCentro,
          sMeiaLargura,
          pos,
          tangente,
          normal
        });
        cursorArco += passo;
      }
    }
    return resultado;
  }
}

/**
 * Constrói a geometria 3D anatômica de um dente:
 * - Incisivos e caninos com esmalte branco puro e bordas incisais/cúspides suaves.
 * - Pré-molares e molares com cúspides brancas e fossa oclusal esculpida e sombreada.
 */
function criarGeometriaDente(ctx: StationBuildContext, spec: SpecDente): THREE.BufferGeometry {
  const { tipo, largura, espessura, altura } = spec;
  const segRad = 28;
  const segAlt = 20;
  const numVertices = (segAlt + 1) * (segRad + 1);

  const pos = new Float32Array(numVertices * 3);
  const cores = new Float32Array(numVertices * 3);
  const indices: number[] = [];

  const corEsmalte = new THREE.Color(0xffffff);
  const corSulco = new THREE.Color(0xa6a3ad);
  const corTemp = new THREE.Color();

  const ehIncisivo = tipo === 'incisivo_central' || tipo === 'incisivo_lateral';
  const ehCanino = tipo === 'canino';
  const ehPremolar = tipo === 'premolar1' || tipo === 'premolar2';
  const ehMolar = tipo === 'molar1' || tipo === 'molar2';

  const meiaL = largura * 0.5;
  const meiaE = espessura * 0.5;

  for (let iy = 0; iy <= segAlt; iy++) {
    const v = iy / segAlt;
    for (let ir = 0; ir <= segRad; ir++) {
      const th = (ir / segRad) * Math.PI * 2;
      const cosT = Math.cos(th);
      const sinT = Math.sin(th);

      const expSquircle = ehMolar ? 2.5 : 2.3;
      const denom = Math.pow(
        Math.pow(Math.abs(cosT), expSquircle) + Math.pow(Math.abs(sinT), expSquircle),
        1 / expSquircle
      );
      const ux = cosT / denom;
      let uz = sinT / denom;

      if (ehMolar && uz > 0.15) {
        const sulcoBucal = Math.exp(-Math.pow(ux / 0.25, 2)) * Math.max(0, uz);
        uz *= 1 - 0.05 * sulcoBucal * Math.sin(Math.min(1, v * 1.15) * Math.PI);
      }

      let x = 0;
      let y = 0;
      let z = 0;
      let fatorSombraOclusal = 0;

      if (ehIncisivo || ehCanino) {
        const vBorda = 0.84;
        const tCorpo = Math.min(1, v / vBorda);
        const tFecho = Math.max(0, (v - vBorda) / (1 - vBorda));
        const rFecho = Math.cos(tFecho * (Math.PI * 0.5));

        const aberturaColo = 0.90 + 0.12 * Math.sin(tCorpo * (Math.PI * 0.58));
        const arredondarAngulo =
          (ehCanino ? 0.10 : tipo === 'incisivo_lateral' ? 0.07 : 0.04) * Math.pow(tCorpo, 2.6);
        const escX = (aberturaColo - arredondarAngulo) * rFecho;

        const bojoCervical = Math.sin(Math.pow(tCorpo, 0.70) * Math.PI * 0.80);
        const espessuraBorda = ehCanino ? 0.44 : 0.36;
        const escZ = THREE.MathUtils.lerp(espessuraBorda, 1.0, bojoCervical) * rFecho;

        x = ux * meiaL * escX;
        z = uz * meiaE * escZ + meiaE * 0.07 * Math.sin(tCorpo * (Math.PI * 0.5));

        const yBase = -0.025;
        const uxEfetivo = ux * rFecho;
        let yBorda: number;
        if (ehCanino) {
          const cuspide = Math.cos(uxEfetivo * (Math.PI * 0.5)) * Math.pow(tCorpo, 1.5);
          yBorda = altura * (0.86 + 0.16 * cuspide);
        } else {
          const cantoIncisal = Math.pow(Math.abs(uxEfetivo), 3.0) * Math.pow(tCorpo, 1.5);
          yBorda = altura * (1.0 - (tipo === 'incisivo_lateral' ? 0.07 : 0.04) * cantoIncisal);
        }
        y = THREE.MathUtils.lerp(yBase, yBorda, suave(tCorpo)) + 0.004 * Math.sin(tFecho * (Math.PI * 0.5));
      } else {
        const vOclusal = 0.70;
        const yBase = -0.025;

        if (v <= vOclusal) {
          const tParede = v / vOclusal;
          const bojo = Math.sin(tParede * Math.PI);
          const escX = THREE.MathUtils.lerp(0.88, 1.0, tParede) + 0.04 * bojo;
          const escZ = THREE.MathUtils.lerp(0.84, 0.96, tParede) + 0.05 * bojo;

          x = ux * meiaL * escX;
          z = uz * meiaE * escZ;
          y = THREE.MathUtils.lerp(yBase, altura * 0.88, suave(tParede * 0.90 + 0.10 * tParede));
        } else {
          const tCap = (v - vOclusal) / (1 - vOclusal);
          const rOclusal = Math.cos(tCap * (Math.PI * 0.5));

          x = ux * meiaL * 1.0 * rOclusal;
          z = uz * meiaE * 0.96 * rOclusal;

          const anelCuspide = Math.sin(Math.min(1, tCap / 0.65) * Math.PI) * rOclusal;
          const fundoFossa = suave(Math.max(0, (tCap - 0.22) / 0.78));

          let relevoCuspide = 0;
          if (ehPremolar) {
            const duasCuspides = Math.pow(Math.abs(sinT), 1.35) * (1 - 0.22 * Math.pow(cosT, 2));
            relevoCuspide = 0.020 * anelCuspide * duasCuspides;
          } else {
            const quatroCuspides = Math.pow(Math.abs(sinT * cosT) * 2, 0.85);
            const cristaMarginal = 0.30 * Math.pow(Math.abs(cosT), 3);
            relevoCuspide = 0.022 * anelCuspide * (quatroCuspides + cristaMarginal);
          }

          const depressaoFossa = (ehMolar ? 0.023 : 0.018) * fundoFossa;
          y = altura * 0.88 + relevoCuspide - depressaoFossa;

          const sulcoMD = Math.exp(-Math.pow((uz * rOclusal) / 0.25, 2));
          const sulcoVL = ehMolar ? Math.exp(-Math.pow((ux * rOclusal) / 0.23, 2)) : 0;
          fatorSombraOclusal = THREE.MathUtils.clamp(
            fundoFossa * 0.88 + 0.38 * Math.max(sulcoMD, sulcoVL) * suave(tCap * 1.3),
            0,
            1
          );
        }
      }

      const k = (iy * (segRad + 1) + ir) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;

      corTemp.copy(corEsmalte);
      if (fatorSombraOclusal > 0.01) {
        corTemp.lerp(corSulco, fatorSombraOclusal * 0.74);
      }
      cores[k] = corTemp.r;
      cores[k + 1] = corTemp.g;
      cores[k + 2] = corTemp.b;

      if (iy < segAlt && ir < segRad) {
        const a = iy * (segRad + 1) + ir;
        const b = a + segRad + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  const geo = ctx.trackGeo(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.setIndex(indices);
  orientarFacesParaFora(geo, new THREE.Vector3(0, altura * 0.4, 0));
  return geo;
}

/**
 * Constrói o bloco gengival em ferradura com almofadas gengivais junto aos dentes,
 * sulcos inter-radiculares suaves e parede alveolar superior/inferior lisa.
 */
function criarGeometriaGengiva(
  ctx: StationBuildContext,
  arco: ArcoDental,
  dentes: DentePosicionado[],
  ehSuperior: boolean
): THREE.BufferGeometry {
  const segS = 140;
  const segV = 32;
  const dirY = ehSuperior ? 1 : -1;
  const alturaBloco = ehSuperior ? 0.205 : 0.215;

  const numVertices = (segS + 1) * (segV + 1);
  const pos = new Float32Array(numVertices * 3);
  const cores = new Float32Array(numVertices * 3);
  const indices: number[] = [];

  const corBase = new THREE.Color(0xffffff);
  const corSombraSulco = new THREE.Color(0xebcfd2);
  const corLuzBossa = new THREE.Color(0xfff6f7);
  const corTemp = new THREE.Color();

  for (let is = 0; is <= segS; is++) {
    const uTotal = (is / segS) * 2 - 1; // [-1, 1]
    const excessoPonta = Math.max(0, (Math.abs(uTotal) - 0.95) / 0.05);
    const escalaTampa = Math.sqrt(Math.max(0, 1 - excessoPonta * excessoPonta));
    const sArco = THREE.MathUtils.clamp(uTotal, -0.95, 0.95) / 0.95;

    const { pos: centroArco, tangente, normal } = arco.amostrar(sArco);
    const empuxoTampa = excessoPonta * 0.022 * (uTotal < 0 ? -1 : 1);

    let somaColar = 0;
    let somaRaiz = 0;
    let meiaEspessuraLocal = 0.035;
    let pesoEsp = 0;

    for (const d of dentes) {
      const distNorm = (sArco - d.sCentro) / d.sMeiaLargura;
      const absD = Math.abs(distNorm);
      const w = Math.exp(-absD * absD * 0.8);
      meiaEspessuraLocal += d.espessura * 0.5 * w;
      pesoEsp += w;

      if (absD < 1.15) {
        const c = Math.max(0, Math.cos(Math.min(1, absD) * (Math.PI * 0.5)));
        somaColar = Math.max(somaColar, Math.sin(c * (Math.PI * 0.5)));
        somaRaiz += Math.exp(-distNorm * distNorm * 2.2) * d.bulgeRaiz;
      }
    }
    if (pesoEsp > 0) {
      meiaEspessuraLocal = (meiaEspessuraLocal - 0.035) / pesoEsp;
    }

    // Freio labial central sutil
    const freioLabial = Math.exp(-Math.pow(sArco / 0.022, 2)) * 0.008;

    const hMargemExterna = -0.005 + 0.016 * somaColar;
    const hMargemInterna = -0.003 + 0.010 * somaColar;

    const rColarExterno = meiaEspessuraLocal * 0.84;
    const rColarInterno = -meiaEspessuraLocal * 0.80;

    const rCentroTampa = 0.0;
    const hCentroTampa = alturaBloco * 0.52;

    for (let iv = 0; iv <= segV; iv++) {
      const phi = (iv / segV) * Math.PI * 2;
      const sinP = Math.sin(phi);

      let r: number;
      let h: number;
      let fatorRelevo = 0;

      if (sinP >= 0) {
        const t = phi / Math.PI;
        const hMargem = THREE.MathUtils.lerp(hMargemExterna, hMargemInterna, t);

        const perfilAltura = Math.pow(Math.sin(t * Math.PI), 0.40);
        h = THREE.MathUtils.lerp(hMargem, alturaBloco, perfilAltura);

        const envParedeExt = Math.sin(Math.min(1, t / 0.52) * Math.PI);
        const rCorpoExt = rColarExterno + 0.017 * Math.pow(envParedeExt, 0.52);
        const rCorpoInt = rColarInterno - 0.012 * Math.sin(Math.max(0, (t - 0.48) / 0.52) * Math.PI);

        r = THREE.MathUtils.lerp(rCorpoExt, rCorpoInt, suave(t));

        if (t < 0.38) {
          const uParede = t / 0.38;
          const janelaColar = Math.sin(Math.min(1, uParede / 0.52) * Math.PI) * Math.pow(1 - uParede, 1.6);
          const sulcoHorizontal = -0.0045 * Math.exp(-Math.pow((uParede - 0.52) / 0.18, 2));
          const valeInterdental = -0.004 * (1 - somaColar) * janelaColar;
          const eminencia = janelaColar * (somaRaiz * 1.25 + 0.005 * somaColar) + valeInterdental;
          const relevoFreio = freioLabial * Math.sin(uParede * Math.PI) * (1 - uParede * 0.4);
          r += eminencia + sulcoHorizontal + relevoFreio;
          fatorRelevo = (somaColar - 0.45) * janelaColar - Math.abs(sulcoHorizontal) * 80;
        }
      } else {
        const tInt = (phi - Math.PI) / Math.PI;
        r = THREE.MathUtils.lerp(rColarInterno, rColarExterno, tInt);
        const afundarAlveolo = Math.sin(tInt * Math.PI) * 0.025;
        h = THREE.MathUtils.lerp(hMargemInterna, hMargemExterna, tInt) + afundarAlveolo;
      }

      r = THREE.MathUtils.lerp(rCentroTampa, r, escalaTampa);
      h = THREE.MathUtils.lerp(hCentroTampa, h, escalaTampa);

      const x = centroArco.x + normal.x * r + tangente.x * empuxoTampa;
      const y = dirY * h;
      const z = centroArco.z + normal.z * r + tangente.z * empuxoTampa;

      const k = (is * (segV + 1) + iv) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;

      corTemp.copy(corBase);
      if (fatorRelevo > 0) {
        corTemp.lerp(corLuzBossa, Math.min(1, fatorRelevo * 0.6));
      } else if (fatorRelevo < 0) {
        corTemp.lerp(corSombraSulco, Math.min(1, -fatorRelevo * 0.8));
      }
      cores[k] = corTemp.r;
      cores[k + 1] = corTemp.g;
      cores[k + 2] = corTemp.b;

      if (is < segS && iv < segV) {
        const a = is * (segV + 1) + iv;
        const b = a + segV + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  const geo = ctx.trackGeo(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.setIndex(indices);
  orientarFacesParaFora(geo, new THREE.Vector3(0, dirY * alturaBloco * 0.5, 0));
  return geo;
}

/**
 * Constrói a abóbada do palato duro e mole no teto da maxila, curvando a borda
 * posterior para baixo de modo que se funda sem emendas com a parede da orofaringe.
 */
function criarGeometriaPalato(ctx: StationBuildContext, arcoSup: ArcoDental): THREE.BufferGeometry {
  const segZ = 40;
  const segX = 38;
  const numVertices = (segZ + 1) * (segX + 1);
  const pos = new Float32Array(numVertices * 3);
  const cores = new Float32Array(numVertices * 3);
  const indices: number[] = [];

  const corBase = new THREE.Color(0xffffff);
  const corRafe = new THREE.Color(0xd8b0b6);
  const corTemp = new THREE.Color();

  for (let iz = 0; iz <= segZ; iz++) {
    const u = iz / segZ; // 0 = frente, 1 = borda posterior alta do palato duro
    const { pos: pDir } = arcoSup.amostrar(Math.min(0.92, 0.03 + u * 0.89));
    const meiaLargura = Math.max(0.03, pDir.x - 0.018);
    const zBase = pDir.z - 0.012;

    for (let ix = 0; ix <= segX; ix++) {
      const s = (ix / segX) * 2 - 1;
      const x = s * meiaLargura;

      const arcoTransversal = Math.max(0, 1 - s * s);
      // A abóbada sobe continuamente até a parte posterior (sem cair na frente da úvula!)
      const arcoLongitudinal = Math.sin(Math.pow(u, 0.58) * (Math.PI * 0.52));
      let y = 0.010 + 0.155 * Math.pow(arcoTransversal, 0.68) * (0.25 + 0.75 * arcoLongitudinal);

      const gaussRafe = Math.exp(-Math.pow(s / 0.052, 2)) * arcoLongitudinal;
      const rafe = -gaussRafe * 0.015;
      y += rafe;

      const k = (iz * (segX + 1) + ix) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = zBase;

      corTemp.copy(corBase).lerp(corRafe, gaussRafe * 0.65);
      cores[k] = corTemp.r;
      cores[k + 1] = corTemp.g;
      cores[k + 2] = corTemp.b;

      if (iz < segZ && ix < segX) {
        const a = iz * (segX + 1) + ix;
        const b = a + segX + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  const geo = ctx.trackGeo(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.setIndex(indices);
  orientarFacesParaFora(geo, new THREE.Vector3(0, 0.45, 0));
  return geo;
}

/**
 * Constrói a língua carnuda acomodada no assoalho da mandíbula, com ponta arredondada,
 * dorso convexo macio e sulco mediano longitudinal bem definido.
 */
function criarGeometriaLingua(ctx: StationBuildContext): THREE.BufferGeometry {
  const segU = 42;
  const segTh = 36;
  const numVertices = (segU + 1) * (segTh + 1);
  const pos = new Float32Array(numVertices * 3);
  const cores = new Float32Array(numVertices * 3);
  const indices: number[] = [];

  const corBase = new THREE.Color(0xffffff);
  const corSulco = new THREE.Color(0xe6c2c6);
  const corTemp = new THREE.Color();

  const zFundo = -0.22;
  const zPonta = 0.255;

  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU;
    const z = THREE.MathUtils.lerp(zFundo, zPonta, u);

    const perfilLargura = Math.sin(Math.pow(u, 0.56) * Math.PI) * (1 - 0.10 * u);
    const meiaLargura = 0.305 * perfilLargura;

    const meiaAltura = 0.084 * Math.sin(Math.pow(u, 0.55) * Math.PI);
    const yCentro = 0.012 + 0.042 * Math.sin(Math.pow(u, 0.65) * Math.PI);

    for (let it = 0; it <= segTh; it++) {
      const th = (it / segTh) * Math.PI * 2;
      const cosT = Math.cos(th);
      const sinT = Math.sin(th);

      const x = cosT * meiaLargura;
      let y = yCentro + sinT * meiaAltura * (sinT > 0 ? 1.0 : 0.65);
      let fatorSulco = 0;

      if (sinT > 0.12 && u > 0.08 && u < 0.92) {
        const envU = Math.sin(((u - 0.08) / 0.84) * Math.PI);
        const gaussCentro = Math.exp(-Math.pow(cosT / 0.18, 2));
        const sulcoCentral = 0.026 * gaussCentro * envU * sinT;
        const ondasLaterais =
          0.005 * Math.sin(u * 20) * Math.exp(-Math.pow((Math.abs(cosT) - 0.34) / 0.26, 2)) * envU * sinT;
        y += -sulcoCentral + ondasLaterais;
        fatorSulco = gaussCentro * envU * sinT;
      }

      const k = (iu * (segTh + 1) + it) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;

      corTemp.copy(corBase).lerp(corSulco, fatorSulco * 0.65);
      cores[k] = corTemp.r;
      cores[k + 1] = corTemp.g;
      cores[k + 2] = corTemp.b;

      if (iu < segU && it < segTh) {
        const a = iu * (segTh + 1) + it;
        const b = a + segTh + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  const geo = ctx.trackGeo(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.setIndex(indices);
  orientarFacesParaFora(geo, new THREE.Vector3(0, 0.01, 0));
  return geo;
}

/**
 * Constrói o conjunto posterior da cavidade oral:
 * 1. Parede posterior côncava da orofaringe com os arcos palatoglosso e palatofaríngeo
 *    e a úvula central em formato de gota arredondada esculpida em relevo contínuo.
 * 2. Bojo faríngeo externo e tubo descendente atrás da parede posterior (`z = -0.22..-0.54`),
 *    reproduzindo fielmente a silhueta lateral da vista 3/4 de referência.
 */
function criarOrofaringeEUvula(
  ctx: StationBuildContext,
  matMucosaBrilhante: THREE.Material,
  matGengivaExterna: THREE.Material
): { group: THREE.Group; meshOrofaringe: THREE.Mesh } {
  const faringeGroup = new THREE.Group();

  // 1. Parede posterior côncava da faringe (fundo da garganta) com o 2º arco (palatofaríngeo)
  const segY = 48;
  const segX = 56;
  const nVerts = (segY + 1) * (segX + 1);
  const pos = new Float32Array(nVerts * 3);
  const cores = new Float32Array(nVerts * 3);
  const idx: number[] = [];

  const corBase = new THREE.Color(0xffffff);
  const corRecesso = new THREE.Color(0xc2959c);
  const corCrista = new THREE.Color(0xfff5f7);
  const corTemp = new THREE.Color();

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY; // 0 = base na mandíbula, 1 = teto junto ao palato
    const y = THREE.MathUtils.lerp(-0.22, 0.28, v);

    for (let ix = 0; ix <= segX; ix++) {
      const s = (ix / segX) * 2 - 1; // [-1, 1]
      const absS = Math.abs(s);

      const meiaLargura = 0.395;
      const x = s * meiaLargura;

      const fundoU = Math.cos(s * (Math.PI * 0.5));
      let z = -0.21 - 0.105 * Math.pow(fundoU, 0.85);

      // 2º Arco (arco palatofaríngeo interno) no fundo da garganta
      const yArco2 = 0.038 - 0.21 * Math.pow(absS, 1.55);
      const distArco2 = y - yArco2;
      const cristaArco2 = Math.exp(-Math.pow(distArco2 / 0.030, 2)) * 0.028 * fundoU;

      // 3ª prega muscular suave mais abaixo
      const yArco3 = -0.052 - 0.16 * Math.pow(absS, 1.50);
      const distArco3 = y - yArco3;
      const cristaArco3 = Math.exp(-Math.pow(distArco3 / 0.028, 2)) * 0.018 * fundoU;

      z += cristaArco2 + cristaArco3;

      const k = (iy * (segX + 1) + ix) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;

      corTemp.copy(corBase);
      if (cristaArco2 > 0.014 || cristaArco3 > 0.010) {
        corTemp.lerp(corCrista, 0.45);
      } else {
        corTemp.lerp(corRecesso, 0.45 * fundoU);
      }
      cores[k] = corTemp.r;
      cores[k + 1] = corTemp.g;
      cores[k + 2] = corTemp.b;

      if (iy < segY && ix < segX) {
        const a = iy * (segX + 1) + ix;
        const b = a + segX + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  const geoParede = ctx.trackGeo(new THREE.BufferGeometry());
  geoParede.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geoParede.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geoParede.setIndex(idx);
  orientarFacesParaFora(geoParede, new THREE.Vector3(0, 0.02, -0.75));
  const meshParede = new THREE.Mesh(geoParede, matMucosaBrilhante);
  faringeGroup.add(meshParede);

  // 2. Cortina do véu palatino (1º arco: palatoglosso) + Úvula central pendente em relevo 3D
  const segU = 64;
  const segV = 26;
  const nvVelo = (segU + 1) * (segV + 1);
  const posVelo = new Float32Array(nvVelo * 3);
  const coresVelo = new Float32Array(nvVelo * 3);
  const idxVelo: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV; // 0 = junção alta no palato, 1 = borda livre arqueada + contorno da úvula
    for (let iu = 0; iu <= segU; iu++) {
      const s = (iu / segU) * 2 - 1;
      const absS = Math.abs(s);

      // Perfil suave em gota arredondada para a úvula no centro (|s| < 0.11)
      const envUvula = Math.exp(-Math.pow(s / 0.075, 2));
      const yTopo = 0.25 - 0.04 * absS * absS;

      const arcoPilar = 0.125 - 0.26 * Math.pow(absS, 1.50);
      const yBordaLivre = arcoPilar - 0.135 * envUvula;

      const estreitamentoUvula = 1 - 0.25 * envUvula * Math.sin(v * (Math.PI * 0.65));
      const x = s * 0.385 * estreitamentoUvula;
      const y = THREE.MathUtils.lerp(yTopo, yBordaLivre, v);

      const fundoU = Math.cos(s * (Math.PI * 0.5));
      // Em v=0 recua para z ≈ -0.22 (fundindo-se ao palato); na borda livre (v=1) avança com brilho
      const zBase = THREE.MathUtils.lerp(-0.22, -0.175, suave(v)) - 0.055 * fundoU;
      const relevoBorda = Math.sin(Math.pow(v, 0.72) * Math.PI) * (0.026 + 0.034 * envUvula);
      const rafeCentral = (1 - v * 0.65) * Math.exp(-Math.pow(s / 0.045, 2)) * 0.014;
      const z = zBase + relevoBorda - rafeCentral;

      const k = (iv * (segU + 1) + iu) * 3;
      posVelo[k] = x;
      posVelo[k + 1] = y;
      posVelo[k + 2] = z;

      corTemp.copy(corBase);
      if (v > 0.50) {
        corTemp.lerp(corCrista, ((v - 0.50) / 0.50) * 0.55);
      } else {
        corTemp.lerp(corRecesso, (1 - v * 2) * 0.25);
      }
      coresVelo[k] = corTemp.r;
      coresVelo[k + 1] = corTemp.g;
      coresVelo[k + 2] = corTemp.b;

      if (iv < segV && iu < segU) {
        const a = iv * (segU + 1) + iu;
        const b = a + segU + 1;
        idxVelo.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  const geoVelo = ctx.trackGeo(new THREE.BufferGeometry());
  geoVelo.setAttribute('position', new THREE.BufferAttribute(posVelo, 3));
  geoVelo.setAttribute('color', new THREE.BufferAttribute(coresVelo, 3));
  geoVelo.setIndex(idxVelo);
  orientarFacesParaFora(geoVelo, new THREE.Vector3(0, 0.10, -0.65));
  const meshOrofaringe = new THREE.Mesh(geoVelo, matMucosaBrilhante);
  faringeGroup.add(meshOrofaringe);

  // 3. Bojo faríngeo externo e tubo descendente atrás da boca (visível na vista 3/4 de referência):
  // Parte suavemente da parede traseira (z = -0.22 em u = 0), faz a curva saliente para trás
  // e desce afunilando abaixo da mandíbula até y = -0.45!
  const segT = 32;
  const segR = 32;
  const nvTubo = (segT + 1) * (segR + 1);
  const posTubo = new Float32Array(nvTubo * 3);
  const coresTubo = new Float32Array(nvTubo * 3);
  const idxTubo: number[] = [];

  for (let i = 0; i <= segT; i++) {
    const u = i / segT;
    const y = THREE.MathUtils.lerp(0.08, -0.45, u);

    const bojoTraseiro = Math.sin(Math.pow(u, 0.52) * Math.PI);
    const zFrente = THREE.MathUtils.lerp(-0.325, -0.24, Math.pow(u, 1.3));
    const zTras = -0.24 - 0.34 * bojoTraseiro - 0.14 * u;
    const zCentro = (zFrente + zTras) * 0.5;
    const rz = Math.max(0.02, (zFrente - zTras) * 0.5);
    const rx = THREE.MathUtils.lerp(0.36, 0.20, Math.pow(u, 0.75)) * (0.85 + 0.15 * bojoTraseiro);

    const tampa =
      u < 0.04
        ? Math.sin((u / 0.04) * (Math.PI * 0.5))
        : u > 0.95
          ? Math.sin(((1 - u) / 0.05) * (Math.PI * 0.5))
          : 1;

    for (let j = 0; j <= segR; j++) {
      const th = (j / segR) * Math.PI * 2;
      const k = (i * (segR + 1) + j) * 3;
      posTubo[k] = Math.cos(th) * rx * tampa;
      posTubo[k + 1] = y;
      posTubo[k + 2] = zCentro + Math.sin(th) * rz * tampa;

      coresTubo[k] = 1;
      coresTubo[k + 1] = 1;
      coresTubo[k + 2] = 1;

      if (i < segT && j < segR) {
        const a = i * (segR + 1) + j;
        const b = a + segR + 1;
        idxTubo.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  const geoTubo = ctx.trackGeo(new THREE.BufferGeometry());
  geoTubo.setAttribute('position', new THREE.BufferAttribute(posTubo, 3));
  geoTubo.setAttribute('color', new THREE.BufferAttribute(coresTubo, 3));
  geoTubo.setIndex(idxTubo);
  orientarFacesParaFora(geoTubo, new THREE.Vector3(0, -0.10, -0.40));
  const meshTubo = new THREE.Mesh(geoTubo, matGengivaExterna);
  meshTubo.castShadow = true;
  faringeGroup.add(meshTubo);

  // Capa externa traseira da parede vertical (fecha a junção lateral em z = -0.21)
  const geoCostasParede = geoParede.clone();
  orientarFacesParaFora(geoCostasParede, new THREE.Vector3(0, 0.02, 0.5));
  ctx.trackGeo(geoCostasParede);
  const meshCostasParede = new THREE.Mesh(geoCostasParede, matGengivaExterna);
  faringeGroup.add(meshCostasParede);

  return { group: faringeGroup, meshOrofaringe };
}

/**
 * Cria um pedaço de alimento orgânico e liso (sem aspecto facetado low-poly).
 */
function criarAlimentoSuave(ctx: StationBuildContext, raio: number) {
  const geo = ctx.trackGeo(new THREE.SphereGeometry(raio, 32, 24));
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const nx = v.x / raio;
    const ny = v.y / raio;
    const nz = v.z / raio;
    const ond = 1 + 0.08 * Math.sin(nx * 4.5 + ny * 3.2) * Math.cos(nz * 4.0);
    v.x *= ond * 1.12;
    v.y *= ond * 0.82;
    v.z *= ond * 1.05;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = materialMacio(ctx, 0xffffff, { roughness: 0.42, sheen: 0.1, clearcoat: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return { mesh, mat };
}

export function createMouthStation(ctx: StationBuildContext): StationInstance {
  const group = new THREE.Group();

  // --------------------------------------------------------------- materiais
  const matGengiva = materialMacio(ctx, 0xdc565c, {
    vertexColors: true,
    roughness: 0.36,
    clearcoat: 0.36,
    clearcoatRoughness: 0.26,
    sheen: 0.14,
    sheenColor: new THREE.Color(0xffc8cb)
  });

  const matPalatoEFaringe = materialMacio(ctx, 0xc24c54, {
    vertexColors: true,
    roughness: 0.18,
    clearcoat: 0.94,
    clearcoatRoughness: 0.12,
    sheen: 0.28,
    sheenColor: new THREE.Color(0xffe4e8)
  });

  const matLingua = materialMacio(ctx, 0xea686e, {
    vertexColors: true,
    roughness: 0.36,
    clearcoat: 0.48,
    clearcoatRoughness: 0.24,
    sheen: 0.20,
    sheenColor: new THREE.Color(0xffd6d9)
  });

  const matDente = ctx.trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.16,
      metalness: 0.0,
      clearcoat: 0.90,
      clearcoatRoughness: 0.12,
      sheen: 0.06,
      sheenColor: new THREE.Color(0xffffff)
    })
  );

  const matSaliva = materialMacio(ctx, COR.saliva, {
    roughness: 0.08,
    transparent: true,
    opacity: 0.82,
    clearcoat: 1
  });

  // ----------------------------------------- orofaringe, arcos e úvula
  const { group: faringe } = criarOrofaringeEUvula(ctx, matPalatoEFaringe, matGengiva);
  faringe.position.set(0, CENTRO_Y, 0);
  group.add(faringe);

  // ----------------------------------------- articulação (pivô traseiro)
  const Z_PIVO = -0.23;

  const maxilarPivo = new THREE.Group();
  maxilarPivo.position.set(0, CENTRO_Y + 0.03, Z_PIVO);
  group.add(maxilarPivo);

  const maxilar = new THREE.Group();
  maxilar.position.set(0, 0, -Z_PIVO);
  maxilarPivo.add(maxilar);

  const mandibulaPivo = new THREE.Group();
  mandibulaPivo.position.set(0, CENTRO_Y - 0.06, Z_PIVO);
  group.add(mandibulaPivo);

  const mandibula = new THREE.Group();
  mandibula.position.set(0, 0, -Z_PIVO);
  mandibulaPivo.add(mandibula);

  // ----------------------------------------- cache de geometrias de dentes
  const cacheGeoSup = new Map<TipoDente, THREE.BufferGeometry>();
  const cacheGeoInf = new Map<TipoDente, THREE.BufferGeometry>();
  for (const spec of DENTES_SUP) {
    cacheGeoSup.set(spec.tipo, criarGeometriaDente(ctx, spec));
  }
  for (const spec of DENTES_INF) {
    cacheGeoInf.set(spec.tipo, criarGeometriaDente(ctx, spec));
  }

  // ----------------------------------------- montagem de cada arcada
  const eixoX = new THREE.Vector3();
  const eixoY = new THREE.Vector3();
  const eixoZ = new THREE.Vector3();
  const matBase = new THREE.Matrix4();

  const montarArcada = (
    pai: THREE.Group,
    arco: ArcoDental,
    specs: SpecDente[],
    cacheGeo: Map<TipoDente, THREE.BufferGeometry>,
    ehSuperior: boolean
  ) => {
    const dentesPos = arco.posicionarDentes(specs);
    const geoGengiva = criarGeometriaGengiva(ctx, arco, dentesPos, ehSuperior);
    const meshGengiva = new THREE.Mesh(geoGengiva, matGengiva);
    meshGengiva.castShadow = true;
    meshGengiva.receiveShadow = true;
    ctx.registerInteractive(meshGengiva, 'mouth', 'Mastigar', 'chew_mouth');
    pai.add(meshGengiva);

    for (const d of dentesPos) {
      const geo = cacheGeo.get(d.tipo)!;
      const meshDente = new THREE.Mesh(geo, matDente);

      const inclinacaoLabial =
        d.tipo === 'incisivo_central' || d.tipo === 'incisivo_lateral'
          ? ehSuperior
            ? 0.06
            : 0.03
          : d.tipo === 'canino'
            ? 0.03
            : 0.0;

      eixoY.set(0, ehSuperior ? -1 : 1, 0);
      eixoY.addScaledVector(d.normal, inclinacaoLabial).normalize();
      eixoZ.copy(d.normal).addScaledVector(eixoY, -d.normal.dot(eixoY)).normalize();
      eixoX.crossVectors(eixoY, eixoZ).normalize();

      matBase.makeBasis(eixoX, eixoY, eixoZ);
      meshDente.quaternion.setFromRotationMatrix(matBase);
      meshDente.scale.set(d.escalaLargura, 1, 1);
      meshDente.position.copy(d.pos);
      meshDente.castShadow = true;
      meshDente.receiveShadow = true;

      ctx.registerInteractive(meshDente, 'mouth', 'Mastigar', 'chew_mouth');
      pai.add(meshDente);
    }
  };

  // Arcada superior (maxila) + abóbada palatina
  const arcoSup = new ArcoDental(0.415, 0.54, -0.22);
  montarArcada(maxilar, arcoSup, DENTES_SUP, cacheGeoSup, true);

  const palato = new THREE.Mesh(criarGeometriaPalato(ctx, arcoSup), matPalatoEFaringe);
  palato.receiveShadow = true;
  maxilar.add(palato);

  // Arcada inferior (mandíbula) + língua
  const arcoInf = new ArcoDental(0.395, 0.51, -0.21);
  montarArcada(mandibula, arcoInf, DENTES_INF, cacheGeoInf, false);

  const lingua = new THREE.Mesh(criarGeometriaLingua(ctx), matLingua);
  lingua.position.set(0, -0.01, 0.01);
  lingua.castShadow = true;
  lingua.receiveShadow = true;
  ctx.registerInteractive(lingua, 'mouth', 'Mastigar', 'chew_mouth');
  mandibula.add(lingua);

  // ------------------------------------------------------- alimento e bolo
  const pedaco = criarAlimentoSuave(ctx, 0.090);
  ctx.registerInteractive(pedaco.mesh, 'mouth', 'Mastigar', 'chew_mouth');
  const migalhas: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const m = criarAlimentoSuave(ctx, 0.020 + Math.random() * 0.015).mesh;
    m.visible = false;
    migalhas.push(m);
  }
  const bolo = esfera(ctx, 0.092, materialMacio(ctx, COR.quimo, { roughness: 0.30, clearcoat: 0.92 }));
  bolo.scale.set(1.2, 0.76, 1.1);
  ctx.registerInteractive(bolo, 'mouth', 'Mastigar', 'chew_mouth');

  const comida = new THREE.Group();
  comida.add(pedaco.mesh, bolo, ...migalhas);
  mandibula.add(comida);
  comida.position.set(0, 0.072, 0.02);

  // Glândulas salivares parótidas
  const gotas = new Gotas(ctx, matSaliva, 18, 0.020);
  group.add(gotas.group);
  const glandulas = [
    new THREE.Vector3(-0.31, CENTRO_Y + 0.12, -0.02),
    new THREE.Vector3(0.31, CENTRO_Y + 0.12, -0.02)
  ];

  // --------------------------------------------------------- animação
  const impulsoMastigada = new Impulso(0.55);
  let aberturaAtual = 0.62;
  let escalaPedaco = 1;
  let escalaBolo = 0;
  let ultimaGotaEm = -1;
  let timerGota = 0;
  const posMigalha = migalhas.map((_, i) => ({
    a: (i / migalhas.length) * Math.PI * 2 + Math.random() * 0.4,
    r: 0.055 + Math.random() * 0.095,
    y: Math.random() * 0.015
  }));

  const update = (cur: Proposta1HD2DSceneProps, dt: number, simTime: number) => {
    const etapa = THREE.MathUtils.clamp(cur.chewCount, 0, MASTIGADAS);
    const feito = etapa >= MASTIGADAS;
    const calmo = cur.lowSensory;
    const t = impulsoMastigada.observar(cur.chewCount, simTime);
    const fechando = pulso(t);

    // 1. Articulação da boca em torno da dobradiça condilar traseira
    const aberturaRepouso = feito ? 0.50 : 0.64;
    const respirar = calmo ? 0 : Math.sin(simTime * 1.2) * 0.012;
    const alvo = aberturaRepouso * (1 - suave(fechando) * 0.85) + respirar;
    aberturaAtual = THREE.MathUtils.damp(aberturaAtual, alvo, 14, dt);

    maxilarPivo.rotation.x = -aberturaAtual * 0.72;
    maxilarPivo.position.y = CENTRO_Y + 0.02 + aberturaAtual * 0.03;

    mandibulaPivo.rotation.x = aberturaAtual * 0.28;
    mandibulaPivo.position.y = CENTRO_Y - 0.05 - aberturaAtual * 0.05;

    const moagemLateral = fechando > 0 && !calmo ? Math.sin(t * Math.PI * 2) * 0.020 : 0;
    mandibulaPivo.position.x = moagemLateral;
    mandibulaPivo.rotation.y = moagemLateral * 0.75;

    // 2. Língua
    lingua.position.y = -0.01 + fechando * 0.020 + (feito ? 0.012 : 0);
    lingua.scale.z = 1.0 - fechando * 0.04;
    comida.position.y = 0.072 + fechando * 0.020 + (feito ? 0.012 : 0);

    // 3. Alimento: cor, trituração, migalhas e formação do bolo alimentar sobre a língua
    aplicarCorAlimento(pedaco.mat, cur.selectedFoodId, Math.min(1, etapa * 0.12));
    const escalaAlvo = etapa === 0 ? 1 : feito ? 0 : 1 - etapa * 0.17;
    escalaPedaco = THREE.MathUtils.damp(escalaPedaco, escalaAlvo, 6, dt);
    pedaco.mesh.visible = escalaPedaco > 0.03;
    const amassar = 1 - fechando * 0.28;
    pedaco.mesh.scale.set(
      escalaPedaco * (1 + (1 - amassar) * 0.36),
      escalaPedaco * amassar,
      escalaPedaco * (1 + (1 - amassar) * 0.24)
    );
    pedaco.mesh.position.y = 0.070 * escalaPedaco * amassar;
    if (!calmo) pedaco.mesh.rotation.y += dt * 0.25;

    const nMigalhas = etapa === 0 ? 0 : feito ? 0 : Math.min(migalhas.length, etapa * 3);
    const corMigalha = new THREE.Color(ALIMENTO[cur.selectedFoodId].miolo);
    migalhas.forEach((m, i) => {
      m.visible = i < nMigalhas;
      if (!m.visible) return;
      (m.material as THREE.MeshPhysicalMaterial).color.copy(corMigalha);
      const p = posMigalha[i];
      const espalhar = 1 - etapa * 0.08;
      m.position.set(
        Math.cos(p.a) * p.r * espalhar,
        0.018 + p.y + fechando * 0.014,
        Math.sin(p.a) * p.r * 0.65 * espalhar
      );
      m.rotation.set(simTime * 0.4 + i, simTime * 0.3, 0);
    });

    const boloAlvo = etapa < 2 ? 0 : feito ? 1 : 0.35 + (etapa - 2) * 0.2;
    escalaBolo = THREE.MathUtils.damp(escalaBolo, boloAlvo, 5, dt);
    bolo.visible = escalaBolo > 0.03;
    const pulsar = feito && !calmo ? 1 + Math.sin(simTime * 2.2) * 0.02 : 1;
    bolo.scale.set(1.2 * escalaBolo * pulsar, 0.76 * escalaBolo, 1.1 * escalaBolo * pulsar);
    bolo.position.y = 0.052 * escalaBolo;
    (bolo.material as THREE.MeshPhysicalMaterial).color
      .set(COR.quimo)
      .lerp(new THREE.Color(ALIMENTO[cur.selectedFoodId].cor), 0.35);

    // 4. Saliva
    const emitindo = fechando > 0.05 || (cur.salivaAdded && !feito);
    if (emitindo && !calmo) {
      timerGota -= dt;
      if (timerGota <= 0) {
        timerGota = fechando > 0.05 ? 0.07 : 0.5;
        const g = glandulas[Math.floor(Math.random() * 2)];
        gotas.emitir(g, new THREE.Vector3(-Math.sign(g.x) * 0.40, -0.05, 0.06));
      }
    } else if (cur.chewCount !== ultimaGotaEm && calmo && fechando > 0.4) {
      ultimaGotaEm = cur.chewCount;
      const g = glandulas[cur.chewCount % 2];
      gotas.emitir(g, new THREE.Vector3(-Math.sign(g.x) * 0.36, -0.05, 0.06));
    }
    gotas.atualizar(dt, CENTRO_Y - 0.09 - aberturaAtual * 0.14);

    matLingua.clearcoat = cur.salivaAdded ? 0.88 : 0.48;
    matLingua.roughness = cur.salivaAdded ? 0.26 : 0.36;
  };

  return { group, update };
}
