import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandBlock, NavFooterLinks, NavList } from "./SidebarNav";

/** Hamburger + slide-in drawer for screens below `lg` (phones and tablets). Radix Dialog gives focus trap, Escape, and focus return. */
export function MobileNav() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={t("nav.open")}
        className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg text-ink hover:bg-white/10 lg:hidden"
      >
        <Menu aria-hidden="true" className="h-6 w-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/50 motion-safe:animate-fade-in lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="theme-dark fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-[var(--nav-line)] bg-[var(--nav-bg)] p-3 shadow-pop motion-safe:animate-slide-in-left lg:hidden"
        >
          <Dialog.Title className="sr-only">{t("nav.main")}</Dialog.Title>
          <div className="mb-6 flex items-center justify-between">
            <BrandBlock />
            <Dialog.Close
              aria-label={t("nav.close")}
              className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg text-ink-soft hover:bg-white/10 hover:text-white"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <nav aria-label={t("nav.main")} className="min-h-0 flex-1 overflow-y-auto">
            <NavList onNavigate={() => setOpen(false)} />
          </nav>
          <NavFooterLinks onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
