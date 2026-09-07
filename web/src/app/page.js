import Logo, { LogoMark } from '@/components/brand/Logo';

export default function Home() {
  return (
    <main className="min-h-dvh grid place-items-center gap-10 p-10">
      <Logo />
      <div className="flex items-end gap-6 text-[#b45309]">
        <LogoMark className="h-6 w-6" />
        <LogoMark className="h-10 w-10" />
        <LogoMark className="h-16 w-16" />
      </div>
    </main>
  );
}
