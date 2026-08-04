"use client";

import UserMenu from "@/components/UserMenu";

/**
 * The collapsed sidebar: toggle at the top, avatar at the bottom.
 *
 * Padding here deliberately mirrors `Sidebar` — `pt-5` on the toggle and `p-3`
 * on the footer — so both controls stay put when the sidebar expands and
 * collapses instead of jumping.
 */
export default function SidebarRail({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex h-full w-14 flex-col border-r-2 border-sand bg-cream">
      <div className="flex justify-center pt-5">
        <button
          type="button"
          onClick={onOpen}
          aria-label="Show conversations"
          aria-expanded={false}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-sand"
        >
          <ExpandIcon />
        </button>
      </div>

      <div className="flex-1" />

      <div className="border-t-2 border-sand p-3">
        <UserMenu compact />
      </div>
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
