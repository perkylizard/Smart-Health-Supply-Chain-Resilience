import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import Badge from "./Badge";

export default function Explain({ kind, item, children }: { kind: "alert" | "transfer"; item: unknown; children: React.ReactNode }) {
  const { lang, t } = useApp();
  const m = useMutation({ mutationFn: () => api.explain(kind, item, lang) });
  return (
    <Dialog.Root onOpenChange={(o) => { if (o && !m.data) m.mutate(); }}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title style={{ marginBottom: 12 }}>{t.whyLink}</Dialog.Title>
          {m.isPending && <p className="skeleton">Loading explanation text placeholder that is long enough to look right</p>}
          {m.data && (<>
            <p style={{ fontSize: "var(--t-md)" }}>{m.data.explanation}</p>
            {m.data.numbers_used?.length > 0 && <p className="muted" style={{ fontSize: 13 }}>{m.data.numbers_used.join(" · ")}</p>}
            <p><Badge kind="ai" /> <span className="faint" style={{ fontSize: 12 }}>{m.data.status}</span></p>
          </>)}
          {m.isError && <p className="muted">Explanation unavailable right now.</p>}
          <Dialog.Close asChild><button className="btn" style={{ marginTop: 12 }}>{t.cancel}</button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
