import { logout } from "@/app/actions/auth";
import { BrandLockup } from "@/components/brand";
import { cn } from "@/lib/format";
import { APP_VERSION } from "@/lib/site";
import { NavLinks, type NavItem } from "./nav-links";
import { MobileWorkspaceMenu } from "./mobile-menu";
import { NotificationBell } from "./notification-bell";

export function WorkspaceShell({
  badge,
  badgeTone = "gold",
  nav,
  userLine,
  showBuildTag = false,
  environmentBanner,
  children,
}: {
  badge: string;
  badgeTone?: "gold" | "emerald" | "sky";
  nav: NavItem[];
  userLine: string;
  /** Internal build/version tag — an operations detail, not something a
      company or partner needs to see in their own workspace. Admin only. */
  showBuildTag?: boolean;
  environmentBanner?: { label: string; body: string };
  children: React.ReactNode;
}) {
  return (
    <div className="workspace-shell flex min-h-screen min-w-0 flex-col lg:flex-row">
      <aside className="sticky top-0 z-40 shrink-0 border-b border-black/[0.08] bg-[#F6F1E7]/95 backdrop-blur-xl lg:flex lg:h-screen lg:w-[236px] lg:flex-col lg:border-b-0 lg:border-r lg:bg-[#F6F1E7] lg:backdrop-blur-none">
        <div className="flex h-[60px] items-center justify-between gap-2 border-b border-black/[0.06] px-4 lg:px-5">
          <BrandLockup markSize={26} />
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                badgeTone === "gold" && "border-gold-600/40 bg-gold-500/10 text-gold-700",
                badgeTone === "emerald" && "border-leaf-300 bg-leaf-50 text-leaf-700",
                badgeTone === "sky" && "border-sky-300 bg-sky-50 text-sky-700",
              )}
            >
              {badge}
            </span>
            <NotificationBell />
            <MobileWorkspaceMenu nav={nav} userLine={userLine} />
          </div>
        </div>
        <nav className="hidden px-3 py-2.5 lg:block lg:py-4">
          <p className="hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 lg:block">
            Workspace
          </p>
          <NavLinks items={nav} />
        </nav>
        <div className="hidden border-t border-black/[0.07] p-4 lg:mt-auto lg:block">
          <p className="truncate text-[11.5px] text-slate-500" title={userLine}>
            {userLine}
          </p>
          <form action={logout} className="mt-2.5">
            <button type="submit" className="btn btn-ghost btn-sm w-full">
              Log out
            </button>
          </form>
          {showBuildTag ? (
            <p className="mt-3 font-mono text-[10px] text-slate-400">Build {APP_VERSION}</p>
          ) : null}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {environmentBanner ? (
          <div className="border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sky-800 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em]">{environmentBanner.label}</span>
              <span className="hidden h-3 w-px bg-sky-300 sm:block" />
              <p className="text-[10px] leading-4 text-sky-700">{environmentBanner.body}</p>
            </div>
          </div>
        ) : null}
        <main className="workspace-main min-w-0 px-3 py-4 min-[390px]:px-4 sm:p-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
