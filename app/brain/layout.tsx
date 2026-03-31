import { BrainShell } from "@/components/brain/brain-shell";

export default function BrainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <BrainShell>{children}</BrainShell>;
}

