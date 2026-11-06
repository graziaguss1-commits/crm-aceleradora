import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Handshake, Mail, Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // Cadastro só por convite: o link traz ?convite=<token>
  const conviteToken = searchParams.get("convite");
  const [convite, setConvite] = useState<null | { email: string; clinica: string; valido: boolean }>(null);
  const [conviteCarregando, setConviteCarregando] = useState(!!conviteToken);

  useEffect(() => {
    if (!conviteToken) return;
    (async () => {
      const { data } = await (supabase as any).rpc("convite_info", { p_token: conviteToken });
      setConvite(data ?? null);
      if (data?.email) setEmail(data.email);
      setConviteCarregando(false);
    })();
  }, [conviteToken]);

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
    } else {
      navigate("/dashboard");
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, convite: conviteToken },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        // O banco recusa cadastro sem convite válido para este e-mail
        const msg = /database error|convite/i.test(error.message)
          ? "Este convite não vale para este e-mail ou já foi usado. Peça um novo link à administração do SISA."
          : error.message;
        toast({ title: "Não foi possível criar o acesso", description: msg, variant: "destructive" });
      } else if (data.session) {
        toast({ title: "Conta criada com sucesso!" });
        navigate("/dashboard");
      } else {
        toast({ title: "Conta criada!", description: "Verifique seu email para confirmar." });
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar conta", description: err?.message || "Tente novamente", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Link só para quem já tem acesso; quem não tem precisa de convite
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    if (error) {
      toast({ title: "Não foi possível enviar o link", description: "Confira o e-mail. O acesso ao SISA é liberado por convite.", variant: "destructive" });
    } else {
      setMagicLinkSent(true);
      toast({ title: "Link enviado!", description: "Verifique seu email." });
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Digite seu email", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email enviado!", description: "Verifique seu email para redefinir a senha." });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Handshake className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SISA</h1>
          <p className="text-sm text-muted-foreground">O comercial da sua clínica, do primeiro contato à consulta</p>
        </div>

        {conviteToken ? (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <p className="eyebrow text-[11px]">Convite de acesso</p>
              <CardTitle>
                {conviteCarregando ? "Carregando convite..." : convite?.valido ? convite.clinica : "Convite indisponível"}
              </CardTitle>
              <CardDescription>
                {conviteCarregando
                  ? "\u00a0"
                  : convite?.valido
                    ? "Crie sua senha para entrar no SISA da sua clínica."
                    : "Este link já foi usado, expirou ou a clínica está inativa. Peça um novo convite. Se você já criou seu acesso, entre pela tela de login."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {convite?.valido ? (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signup-name" placeholder="Seu nome" className="pl-9" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signup-email" type="email" className="pl-9" value={email} readOnly />
                    </div>
                    <p className="text-xs text-muted-foreground">O convite vale só para este e-mail.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="signup-password" type="password" placeholder="Mínimo 6 caracteres" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Criando acesso..." : "Criar meu acesso"}
                  </Button>
                </form>
              ) : (
                !conviteCarregando && (
                  <Button variant="outline" className="w-full" onClick={() => navigate("/")}>Ir para o login</Button>
                )
              )}
            </CardContent>
          </Card>
        ) : (
        <Card className="border-border">
          <Tabs defaultValue="login">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="magic">Link por e-mail</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              <TabsContent value="login" className="mt-0 space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-9"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-9"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Esqueceu a senha?
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="magic" className="mt-0 space-y-4">
                {magicLinkSent ? (
                  <div className="py-8 text-center">
                    <Mail className="mx-auto mb-4 h-12 w-12 text-primary" />
                    <CardTitle className="mb-2">Verifique seu email</CardTitle>
                    <CardDescription>
                      Enviamos um link de acesso para <strong>{email}</strong>
                    </CardDescription>
                  </div>
                ) : (
                  <form onSubmit={handleMagicLink} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="magic-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="magic-email"
                          type="email"
                          placeholder="seu@email.com"
                          className="pl-9"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Enviando..." : "Enviar link de acesso"}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
        )}
        {!conviteToken && (
          <p className="text-center text-xs text-muted-foreground">
            O acesso ao SISA é liberado por convite da sua clínica.
          </p>
        )}
      </div>
    </div>
  );
}
