import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-md border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded bg-primary text-sm font-bold text-white">S</div>
          <div>
            <h1 className="text-base font-semibold">Seoudi PIM</h1>
            <p className="text-xs text-muted-foreground">Product Content Operations</p>
          </div>
        </div>
        <LoginForm next={next} />
        <div className="mt-5 rounded border border-dashed p-2.5 text-[11px] leading-5 text-muted-foreground">
          <div className="font-medium text-foreground">Demo accounts (password <code>Seoudi@2026</code>)</div>
          admin@ · ecom@ · creator1@ · creator2@ · quality@ · viewer@ <span className="whitespace-nowrap">seoudi.local</span>
        </div>
      </div>
    </div>
  );
}
