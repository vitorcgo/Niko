import { descompactarOffice } from "./officeLimitado";

self.onmessage = (evento: MessageEvent<{ dados: ArrayBuffer; extensao: string }>) => {
  try {
    const arquivos = descompactarOffice(new Uint8Array(evento.data.dados), evento.data.extensao);
    self.postMessage({ arquivos }, { transfer: Object.values(arquivos).map((a) => a.buffer) });
  } catch (erro) {
    const codigo = (erro as Error)?.message;
    self.postMessage({ erro: codigo === "office_grande" || codigo === "arquivo_grande" ? codigo : "leitura" });
  }
};
