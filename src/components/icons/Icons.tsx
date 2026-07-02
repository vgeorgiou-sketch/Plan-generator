import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 18, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function IconSelect(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 4 L6 19 L10 15.5 L13 20.5 L15.5 19 L12.5 14 L18 13.5 Z" />
    </svg>
  );
}

export function IconPan(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M14 11.2V6a1.5 1.5 0 0 1 3 0v8" />
      <path d="M17 12v2a5.5 5.5 0 0 1-5.5 5.5h-1A6.5 6.5 0 0 1 4 13l.3-.8a1.4 1.4 0 0 1 2.5-.2L8 13.5" />
    </svg>
  );
}

export function IconTrace(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 17 L5 8 L12 5 L19 8 L19 15" strokeDasharray="2.5 2.5" />
      <circle cx="5" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCalibrate(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="5.5" cy="18.5" r="1.6" />
      <circle cx="18.5" cy="5.5" r="1.6" />
      <path d="M6.8 17.2 L17.2 6.8" strokeDasharray="2 2.2" />
    </svg>
  );
}

export function IconCore(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 12 H20 M12 4 V20" />
      <path d="M4 4 L10.5 10.5 M10.5 4 L4 10.5" />
    </svg>
  );
}

export function IconZoneSplit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 15 L20 9" strokeDasharray="2.5 2" />
      <circle cx="4" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 8 H15 a5 5 0 0 1 0 10 H10" />
      <path d="M10 4.5 L6.5 8 L10 11.5" />
    </svg>
  );
}

export function IconExport(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4 V15" />
      <path d="M8 11 L12 15 L16 11" />
      <path d="M5 18 H19" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 15 V4" />
      <path d="M8 8 L12 4 L16 8" />
      <path d="M5 18 H19" />
    </svg>
  );
}

export function IconCube(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" />
      <path d="M4 7.5 L12 12 L20 7.5" />
      <path d="M12 12 V21" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6 L18 18 M18 6 L6 18" />
    </svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12 H19" />
    </svg>
  );
}
