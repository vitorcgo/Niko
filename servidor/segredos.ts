import { plataforma } from "./plataforma/index.ts";

const cache = new Map<string, string | null>();
const leiturasEmAndamento = new Map<string, Promise<string | null>>();

function validarId(id: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error("id_invalido");
}

export async function gravarSegredo(id: string, segredo: string) {
  validarId(id);
  if (!segredo || segredo.length > 4000) throw new Error("segredo_invalido");
  await plataforma.segredos.gravar(id, segredo);
  leiturasEmAndamento.delete(id);
  cache.set(id, segredo);
}

export async function lerSegredo(id: string): Promise<string | null> {
  validarId(id);
  if (cache.has(id)) return cache.get(id) ?? null;
  const emAndamento = leiturasEmAndamento.get(id);
  if (emAndamento) return emAndamento;
  const leitura: Promise<string | null> = plataforma.segredos
    .ler(id)
    .then((valor) => {
      if (leiturasEmAndamento.get(id) === leitura) cache.set(id, valor);
      return valor;
    })
    .finally(() => {
      if (leiturasEmAndamento.get(id) === leitura) leiturasEmAndamento.delete(id);
    });
  leiturasEmAndamento.set(id, leitura);
  return leitura;
}

export async function apagarSegredo(id: string) {
  validarId(id);
  cache.delete(id);
  leiturasEmAndamento.delete(id);
  await plataforma.segredos.apagar(id);
}
