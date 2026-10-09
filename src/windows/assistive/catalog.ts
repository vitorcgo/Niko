import { control, type AppInstalled } from "../../bridge/localBridge";

let list: AppInstalled[] | null = null;
let loading: Promise<AppInstalled[]> | null = null;
const icons = new Map<string, string | null>();
const requests = new Map<string, Promise<void>>();

export function listAppsAssistive(force = false): Promise<AppInstalled[]> {
  if (loading) return loading;
  if (list && !force) return Promise.resolve(list);
  loading = control.apps(force).then((apps) => {
    list = apps.filter((a) => a.id && a.nome).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return list;
  }).finally(() => { loading = null; });
  return loading;
}

export async function loadIconsAssistive(ids: string[]): Promise<Record<string, string | null>> {
  const uniqueItems = [...new Set(ids)];
  const missing = uniqueItems.filter((id) => !icons.has(id) && !requests.has(id));
  if (missing.length) {
    const request = control.iconesDeApps(missing).then((response) => {
      for (const id of missing) icons.set(id, response.find((i) => i.id === id)?.icone ?? null);
    }).finally(() => { for (const id of missing) requests.delete(id); });
    for (const id of missing) requests.set(id, request);
  }
  await Promise.all(uniqueItems.map((id) => requests.get(id)));
  return Object.fromEntries(uniqueItems.map((id) => [id, icons.get(id) ?? null]));
}
