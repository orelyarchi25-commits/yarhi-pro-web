"use client";

import type { ReactNode } from "react";
import {
  getProfileIconPaths,
  resolveProfileIconKey,
  type ProfileIconKey,
} from "@/lib/profile-icons";

type Props = {
  profileName: string;
  className?: string;
};

const PATH_BODY: Record<ProfileIconKey, ReactNode> = {
  "l-wall-120": (
    <>
      <rect x="8" y="2" width="16" height="40" />
      <path d="M24 42h14" />
    </>
  ),
  "double-t-140": (
    <>
      <path d="M12 2h22v8H24v36h10v8H2v-2h6V10h4V2z" />
      <rect x="14" y="12" width="8" height="32" />
      <path d="M18 12v32" />
    </>
  ),
  "double-t-hitech": <path d="M16 2h10v6h4v36h8v6H16V44H4v-6h12V34H4v-6h12V24H4v-6h12V14H4V8h12V2z" />,
  "rect-20-40": <rect x="2" y="2" width="16" height="36" />,
  "rect-20-70": <rect x="2" y="2" width="16" height="66" />,
  "rect-20-20": <rect x="3" y="3" width="18" height="18" />,
  "rect-20-100": <rect x="2" y="2" width="16" height="96" />,
  "rect-120-40": <rect x="6" y="2" width="16" height="48" />,
  "rect-100-40": <rect x="6" y="2" width="16" height="44" />,
  "angle-30": <path d="M4 4v20h20" />,
  "post-80": <rect x="3" y="3" width="22" height="22" />,
  "post-100": <rect x="3" y="3" width="22" height="22" />,
  "post-130": <rect x="3" y="3" width="22" height="22" />,
  "t-beam-100": (
    <>
      <rect x="12" y="2" width="16" height="36" />
      <path d="M2 38h36" />
    </>
  ),
  "t-beam-120": (
    <>
      <rect x="12" y="2" width="16" height="40" />
      <path d="M2 42h36" />
    </>
  ),
  "t-led-100": (
    <>
      <rect x="12" y="2" width="16" height="36" />
      <path d="M2 38h36" />
      <path d="M15 31h10v5H15z" />
    </>
  ),
  "t-led-120": (
    <>
      <rect x="12" y="2" width="16" height="40" />
      <path d="M2 42h36" />
      <path d="M12 34h16" />
      <path d="M15 35h10v5H15z" />
    </>
  ),
};

/**
 * Catalog cross-section next to a Hebrew profile name.
 * Unknown names → invisible spacer so flex layout stays aligned.
 */
export function ProfileIcon({ profileName, className = "w-6 h-6 shrink-0 text-gray-700" }: Props) {
  const key = resolveProfileIconKey(profileName);
  if (!key) return <div className="w-6 h-6 shrink-0" aria-hidden />;
  const { viewBox } = getProfileIconPaths(key);
  return (
    <svg
      className={className}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      {PATH_BODY[key]}
    </svg>
  );
}

/** Icon + label for React tables (RTL). */
export function ProfileNameWithIcon({
  profileName,
  className = "",
}: {
  profileName: string;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <ProfileIcon profileName={profileName} />
      <span>{profileName}</span>
    </span>
  );
}
