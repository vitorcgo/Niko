import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useFinances } from "../state/finances";
import { normalizeText } from "../utils/basics";
import { T } from "../i18n/ptBR";
import type { Category } from "../types";

const CREATE = "__criar";
const NEW = "__nova";

interface Props {
  id?: string;
  tipo: Category["tipo"];
  categoriaId: string;
  novaCategoria?: string;
  aoMudar: (categoryId: string, newCategory: string) => void;
  invalido?: boolean;
  className?: string;
}

/** Pick an existing category or enter a new name; create the category only when the entry is saved. */
export function CategoryPicker({ id, tipo: type, categoriaId: categoryId, novaCategoria: newCategory = "", aoMudar: onChange, invalido: invalid, className = "seletor" }: Props) {
  const categories = useFinances((s) => s.categorias).filter((c) => c.tipo === type);
  const [creating, setCreating] = useState(false);
  const [nameValue, setName] = useState("");

  useEffect(() => {
    if (!categoryId && !newCategory && categories.length === 0) setCreating(true);
  }, [categoryId, newCategory, categories.length]);

  const confirmName = () => {
    const clean = nameValue.trim().slice(0, 40);
    if (!clean) return;
    const existing = categories.find((c) => normalizeText(c.nome) === normalizeText(clean));
    onChange(existing?.id ?? "", existing ? "" : clean);
    setCreating(false);
  };

  if (creating)
    return (
      <span className="seletor-categoria-nova">
        <input
          id={id}
          className={className === "seletor" ? "campo" : className}
          autoFocus
          maxLength={40}
          value={nameValue}
          placeholder={T.financas.nomeCategoria}
          aria-label={T.financas.nomeCategoria}
          aria-invalid={invalid}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              confirmName();
            }
            if (e.key === "Escape" && categories.length > 0) {
              e.stopPropagation();
              setCreating(false);
            }
          }}
        />
        <button type="button" className="botao botao-fantasma botao-pequeno" aria-label={T.geral.confirmar} disabled={!nameValue.trim()} onClick={confirmName}>
          <Check size={13} />
        </button>
        {categories.length > 0 && (
          <button type="button" className="botao botao-fantasma botao-pequeno" aria-label={T.geral.cancelar} onClick={() => setCreating(false)}>
            <X size={13} />
          </button>
        )}
      </span>
    );

  const value = categories.some((c) => c.id === categoryId) ? categoryId : newCategory ? NEW : "";
  return (
    <select
      id={id}
      className={className}
      value={value}
      aria-label={T.financas.categoria}
      aria-invalid={invalid}
      onChange={(e) => {
        const v = e.target.value;
        if (v === CREATE) {
          setName(newCategory);
          setCreating(true);
        } else if (v !== NEW) onChange(v, "");
      }}
    >
      <option value="" disabled>{T.financas.escolhaCategoria}</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      {newCategory && <option value={NEW}>{T.chat.respostas.categoriaNova(newCategory)}</option>}
      <option value={CREATE}>{T.financas.criarCategoriaOpcao}</option>
    </select>
  );
}
