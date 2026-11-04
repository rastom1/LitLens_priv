import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { FileUp, X } from "lucide-react";
import type { AnalyzeRequest } from "../lib/types";
import { Button, IconButton, Mono, cn } from "./ui/primitives";

const MAX_WORDS = 5000;
const MIN_WORDS = 30;
const words = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

function fromHTML(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, nav, header, footer, aside, noscript, figure, form").forEach((n) => n.remove());
  const scope = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  const ps = [...scope.querySelectorAll("p")].map((p) => (p.textContent ?? "").replace(/\s+/g, " ").trim()).filter((s) => s.split(" ").length > 4);
  const title = (doc.querySelector("h1")?.textContent ?? doc.title ?? "").replace(/\s+/g, " ").trim();
  return { title, text: ps.length ? ps.join("\n\n") : (scope.textContent ?? "").trim() };
}

function fromPlain(raw: string) {
  const lines = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const first = lines[0].replace(/^#+\s*/, "").trim();
  const hasTitle = first && first.length < 140 && !/[.!?]$/.test(first) && lines.length > 1;
  const body = (hasTitle ? lines.slice(1) : lines).join("\n");
  return { title: hasTitle ? first : "", text: body.replace(/^#+\s*/gm, "").replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1").trim() };
}

export function PasteDialog({ open, onClose, onSubmit }: { open: boolean; onClose(): void; onSubmit(req: AnalyzeRequest): void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const n = words(text);

  useEffect(() => {
    const d = dlg.current!;
    if (open && !d.open) {
      setError("");
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const loadFile = (file?: File) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!["txt", "md", "markdown", "html", "htm"].includes(ext) && !file.type.startsWith("text/")) {
      setError(`LitLens can't read .${ext} files yet. Upload a .txt, .md or .html file, or copy the text out of the PDF or Word file and paste it.`);
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("That file is over 3 MB. Upload a smaller file or paste the article text.");
      return;
    }
    const r = new FileReader();
    r.onerror = () => setError("LitLens couldn't read that file. Try again or paste the text instead.");
    r.onload = () => {
      const raw = String(r.result ?? "");
      const parsed = ext.startsWith("htm") || file.type.includes("html") ? fromHTML(raw) : fromPlain(raw);
      setText(parsed.text);
      if (parsed.title && !title.trim()) setTitle(parsed.title);
      setFileName(file.name);
      setError(parsed.text ? "" : "That file has no readable text.");
    };
    r.readAsText(file);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (n < MIN_WORDS) {
      setError(`Paste at least a few sentences (${MIN_WORDS} words or more) so LitLens has an argument to map.`);
      return;
    }
    onSubmit({ title: title.trim() || undefined, text, source_label: fileName || "Pasted text" });
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    loadFile(e.dataTransfer.files[0]);
  };

  return (
    <dialog
      ref={dlg}
      onClose={onClose}
      onClick={(e) => e.target === dlg.current && onClose()}
      className="m-auto w-[min(720px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-rise"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[18px] font-semibold tracking-tight">Analyze your own article</h2>
            <p className="mt-0.5 text-[13px] text-fg-2">Paste the text, or upload a .txt, .md or .html file.</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg-2">Headline (optional, helps find the main claim)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 rounded-lg border border-line bg-bg px-3 text-[14px] transition-colors outline-none focus:border-claim-ink"
          />
        </label>

        <label
          className="flex flex-col gap-1.5"
          onDragEnter={(e) => (e.preventDefault(), setOver(true))}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <span className="text-[12.5px] font-medium text-fg-2">Article text</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
            placeholder="Paste the article here, or drop a file on this box. Leave a blank line between paragraphs."
            className={cn(
              "min-h-60 resize-y rounded-lg border bg-bg px-3 py-2.5 font-read text-[16px] leading-relaxed transition-colors outline-none focus:border-claim-ink",
              over ? "border-dashed border-claim-ink bg-claim/5" : "border-line",
            )}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-fg-3">
          <input ref={fileInput} type="file" hidden accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html" onChange={(e) => (loadFile(e.target.files?.[0]), (e.target.value = ""))} />
          <Button variant="ghost" className="border border-dashed border-line" icon={<FileUp className="size-3.5" />} onClick={() => fileInput.current?.click()}>
            Upload file
          </Button>
          {fileName && <Mono className="text-fg-2">{fileName}</Mono>}
          <Mono className={cn("ml-auto", n > MAX_WORDS && "text-caution")}>
            {n.toLocaleString()} / {MAX_WORDS.toLocaleString()} words{n > MAX_WORDS && " · the rest will be cut"}
          </Mono>
        </div>

        {error && <p className="text-[12.5px] text-attack-ink">{error}</p>}
        <p className="text-[12px] text-fg-3">No trained model is connected yet: the mock API labels your text with keyword rules, so treat the result as a test of the interface.</p>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Analyze text
          </Button>
        </div>
      </form>
    </dialog>
  );
}
