import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Zap,
  FileText,
  Activity,
  Kanban,
  CalendarClock,
  BarChart3,
  Target,
  Settings,
  Plug,
  Shield,
  LogOut,
  HelpCircle,
  Stethoscope,
  TrendingUp,
  Megaphone,
} from "lucide-react";
import { HelpCenter } from "@/components/help/HelpCenter";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const generalItems = [
  { title: "Dashboard",   url: "/dashboard", icon: LayoutDashboard },
  { title: "Pacientes",   url: "/patients",  icon: Users },
  { title: "Médicos", url: "/professionals", icon: Stethoscope },
  { title: "Agenda",      url: "/agenda",    icon: Calendar },
];

const operationalItems = [
  { title: "Automações", url: "/automations", icon: Zap },
  { title: "Pipeline",   url: "/pipeline",    icon: Kanban },
  { title: "Follow-ups", url: "/follow-ups",  icon: CalendarClock },
  { title: "Atividades", url: "/activities",  icon: Activity },
];

const analyticsItems = [
  { title: "Dash. comercial", url: "/dashboard-comercial", icon: TrendingUp },
  { title: "Dash. marketing", url: "/dashboard-marketing", icon: Megaphone },
  { title: "Relatórios", url: "/reports",      icon: BarChart3 },
  { title: "Metas",      url: "/health-goals", icon: Target },
];

const adminItems = [
  { title: "Configurações", url: "/settings",              icon: Settings },
  { title: "Integrações",   url: "/settings/integrations", icon: Plug },
  { title: "Segurança",     url: "/settings/security",     icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, signOut } = useAuth();
  
  const [helpOpen, setHelpOpen] = useState(false);
  
  

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const renderNavGroup = (items: typeof generalItems, label?: string) => (
    <SidebarGroup>
      <SidebarGroupContent>
        {label && !collapsed && (
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        )}
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <NavLink to={item.url} end={item.url === "/dashboard"} className="hover:bg-accent/50" activeClassName="bg-accent text-accent-foreground font-medium">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-border">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Stethoscope className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && <span className="text-lg font-semibold tracking-tight">CRM Saúde</span>}
          </div>
        </SidebarHeader>
        <SidebarContent>
          {renderNavGroup(generalItems, "Geral")}
          {renderNavGroup(operationalItems, "Operacional")}
          {renderNavGroup(analyticsItems, "Analytics")}
          {renderNavGroup(adminItems, "Admin")}
        </SidebarContent>
        <SidebarFooter className="border-t border-border p-3 space-y-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Ajuda"
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Ajuda</span>}
          </button>
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">{profile?.name?.charAt(0)?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-sm font-medium">{profile?.name || "Usuário"}</span>
                <span className="truncate text-xs text-muted-foreground">{profile?.email}</span>
              </div>
            )}
            {!collapsed && (
              <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <HelpCenter open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
