import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Shield, Search, Download, AlertTriangle, CheckCircle, XCircle, LogOut, UserPlus, Trash2 } from "lucide-react";

interface Session {
  id: string;
  session_id: string;
  scene: string;
  interlocutor: string;
  started_at: string;
  ended_at: string | null;
  total_turns: number;
  transcript: any;
  metadata: any;
}

interface SessionMetadata {
  crisis_count: number;
  pii_count: number;
  controversial_count: number;
  coaching_count: number;
  avg_user_message_length: number;
  completion_status: string;
}

interface ModerationLog {
  id: string;
  session_id: string;
  original_response: string;
  block_reason: string;
  blocked_at: string;
  moderation_details: any;
}

interface AdminUser {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

export default function Admin() {
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [sessionMetadata, setSessionMetadata] = useState<Record<string, SessionMetadata>>({});
  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");

  // Check admin access
  useEffect(() => {
    checkAdminAccess();
  }, []);

  // Load sessions when admin access confirmed
  useEffect(() => {
    if (isAdmin) {
      loadSessions();
      loadModerationLogs();
      loadAdminUsers();
    }
  }, [isAdmin]);

  // Filter sessions based on search and status
  useEffect(() => {
    let filtered = sessions;

    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.session_id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      const metadata = Object.values(sessionMetadata);
      filtered = filtered.filter(s => {
        const meta = sessionMetadata[s.id];
        return meta && meta.completion_status === statusFilter;
      });
    }

    setFilteredSessions(filtered);
  }, [searchQuery, statusFilter, sessions, sessionMetadata]);

  async function checkAdminAccess() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // No user logged in - redirect to admin login
        window.location.href = '/admin-login';
        return;
      }

      // Check if user has admin role
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (error) {
        console.error("Error checking admin access:", error);
        setIsAdmin(false);
      } else if (!data) {
        // User is not admin - check if they can grant themselves admin (first user setup)
        await checkFirstUserSetup(user.id);
      } else {
        setIsAdmin(true);
      }
    } catch (err) {
      console.error("Admin check failed:", err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  async function checkFirstUserSetup(userId: string) {
    // Check if any admin exists
    const { data: existingAdmins } = await supabase
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (!existingAdmins || existingAdmins.length === 0) {
      // No admins exist - allow this user to grant themselves admin
      setIsAdmin(false); // Show setup button
    } else {
      setIsAdmin(false); // Another admin exists, deny access
    }
  }

  async function grantSelfAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role: "admin" });

    if (error) {
      toast({
        title: "Error granting admin access",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Admin access granted",
        description: "You now have admin privileges.",
      });
      setIsAdmin(true);
    }
  }

  async function loadSessions() {
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("sessions")
      .select("*")
      .order("started_at", { ascending: false });

    if (sessionsError) {
      console.error("Error loading sessions:", sessionsError);
      toast({
        title: "Error loading sessions",
        description: sessionsError.message,
        variant: "destructive",
      });
      return;
    }

    setSessions(sessionsData || []);

    // Load metadata for all sessions
    const { data: metadataData, error: metadataError } = await supabase
      .from("session_metadata")
      .select("*");

    if (metadataError) {
      console.error("Error loading metadata:", metadataError);
    } else if (metadataData) {
      const metadataMap: Record<string, SessionMetadata> = {};
      metadataData.forEach(m => {
        metadataMap[m.session_id] = m;
      });
      setSessionMetadata(metadataMap);
    }
  }

  async function loadModerationLogs() {
    const { data, error } = await supabase
      .from("moderation_logs")
      .select("*")
      .order("blocked_at", { ascending: false });

    if (error) {
      console.error("Error loading moderation logs:", error);
    } else {
      setModerationLogs(data || []);
    }
  }

  async function loadAdminUsers() {
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .eq("role", "admin")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading admin users:", error);
      return;
    }

    // For client-side, we'll just show user IDs
    // To show emails, we'd need an edge function
    setAdminUsers((data || []) as AdminUser[]);
  }

  async function grantAdminRole() {
    if (!newAdminEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Processing...",
      description: "Looking up user and granting access",
    });

    try {
      // Call edge function to grant admin role by email
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grant-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ email: newAdminEmail.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to grant admin access');
      }

      toast({
        title: "Admin access granted",
        description: `${newAdminEmail} is now an admin`,
      });

      setNewAdminEmail("");
      loadAdminUsers();
    } catch (err: any) {
      toast({
        title: "Error granting admin access",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function revokeAdminRole(userId: string, email: string) {
    if (adminUsers.length === 1) {
      toast({
        title: "Cannot revoke",
        description: "Cannot remove the last admin. Grant someone else admin first.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");

    if (error) {
      toast({
        title: "Error revoking access",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Admin access revoked",
        description: `${email} is no longer an admin`,
      });
      loadAdminUsers();
    }
  }

  function exportToCSV() {
    const csvRows = [
      ["Session ID", "Scene", "Interlocutor", "Started At", "Ended At", "Total Turns", "Crisis Count", "PII Count", "Controversial Count", "Coaching Count", "Avg Message Length", "Status"]
    ];

    sessions.forEach(s => {
      const meta = sessionMetadata[s.id];
      csvRows.push([
        s.session_id,
        s.scene,
        s.interlocutor,
        new Date(s.started_at).toLocaleString(),
        s.ended_at ? new Date(s.ended_at).toLocaleString() : "In Progress",
        s.total_turns.toString(),
        meta?.crisis_count?.toString() || "0",
        meta?.pii_count?.toString() || "0",
        meta?.controversial_count?.toString() || "0",
        meta?.coaching_count?.toString() || "0",
        meta?.avg_user_message_length?.toString() || "0",
        meta?.completion_status || "unknown"
      ]);
    });

    const csvContent = csvRows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jordan-sessions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Sessions exported to CSV",
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking access...</p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/10 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need admin privileges to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If you're the first user setting up the system, you can grant yourself admin access.
            </p>
            <Button onClick={grantSelfAdmin} className="w-full">
              Grant Admin Access (One-Time Setup)
            </Button>
            <Button variant="outline" onClick={() => window.location.href = "/"} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/10 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="w-8 h-8 text-primary" />
              Admin Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review test sessions and moderation logs
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => window.location.href = "/"} variant="outline">
              Back to App
            </Button>
            <Button 
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/admin-login';
              }} 
              variant="ghost"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        <Tabs defaultValue="sessions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sessions">Sessions ({sessions.length})</TabsTrigger>
            <TabsTrigger value="moderation">Moderation Logs ({moderationLogs.length})</TabsTrigger>
            <TabsTrigger value="users">User Management ({adminUsers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="space-y-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Search by Session ID</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g., ABC12345"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={exportToCSV} variant="outline" className="w-full">
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sessions List */}
            <div className="grid gap-4">
              {filteredSessions.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-muted-foreground">No sessions found</p>
                  </CardContent>
                </Card>
              ) : (
                filteredSessions.map(session => {
                  const meta = sessionMetadata[session.id];
                  return (
                    <Card key={session.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setSelectedSession(session)}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg font-mono">{session.session_id}</CardTitle>
                            <CardDescription>
                              {session.scene} • {session.interlocutor} • {new Date(session.started_at).toLocaleString()}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            {meta?.crisis_count > 0 && (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {meta.crisis_count} Crisis
                              </Badge>
                            )}
                            {meta?.pii_count > 0 && (
                              <Badge variant="secondary" className="gap-1">
                                {meta.pii_count} PII
                              </Badge>
                            )}
                            {meta?.completion_status === "completed" ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Completed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                In Progress
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Turns</p>
                            <p className="font-medium">{session.total_turns}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Coach Hints</p>
                            <p className="font-medium">{meta?.coaching_count || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Avg Message Length</p>
                            <p className="font-medium">{meta?.avg_user_message_length || 0} words</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Duration</p>
                            <p className="font-medium">
                              {session.ended_at
                                ? `${Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)}m`
                                : "Ongoing"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Session Detail Modal */}
            {selectedSession && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedSession(null)}>
                <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="font-mono">{selectedSession.session_id}</CardTitle>
                        <CardDescription>{new Date(selectedSession.started_at).toLocaleString()}</CardDescription>
                      </div>
                      <Button variant="outline" onClick={() => setSelectedSession(null)}>
                        <XCircle className="w-4 h-4 mr-2" />
                        Close
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedSession.transcript && Array.isArray(selectedSession.transcript) && selectedSession.transcript.length > 0 ? (
                      selectedSession.transcript.map((turn: any, i: number) => (
                        <div key={i} className="space-y-2">
                          <div className={`p-4 rounded-lg ${turn.role === "user" ? "bg-primary/10" : "bg-muted/50"}`}>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">
                              {turn.role === "user" ? "USER" : "JORDAN"}
                            </p>
                            <p className="leading-relaxed">{turn.content}</p>
                          </div>
                          {turn.coachTip && (
                            <div className="ml-4 p-3 rounded-lg bg-accent/20 border border-accent/30">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">💡 COACH</p>
                              <p className="text-sm">{turn.coachTip}</p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted-foreground">No transcript available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="moderation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Blocked Responses</CardTitle>
                <CardDescription>
                  Responses that were blocked by the moderation system. Review these to identify false positives.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {moderationLogs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No moderation logs found</p>
                ) : (
                  moderationLogs.map(log => (
                    <div key={log.id} className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="destructive">Blocked</Badge>
                        <p className="text-xs text-muted-foreground">{new Date(log.blocked_at).toLocaleString()}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Reason: {log.block_reason}</p>
                        <p className="text-sm text-muted-foreground">Original response:</p>
                        <div className="p-3 rounded bg-background/50 border border-border">
                          <p className="text-sm">{log.original_response}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            {/* Grant Admin Access */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Grant Admin Access
                </CardTitle>
                <CardDescription>
                  Add admin privileges to an existing user by entering their email address
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && grantAdminRole()}
                  />
                  <Button onClick={grantAdminRole}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Grant Access
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Note: The user must have already signed up at /admin-login before you can grant them admin access.
                </p>
              </CardContent>
            </Card>

            {/* Current Admins */}
            <Card>
              <CardHeader>
                <CardTitle>Current Admins ({adminUsers.length})</CardTitle>
                <CardDescription>
                  Users with admin privileges who can access this dashboard
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {adminUsers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No admin users found</p>
                ) : (
                  adminUsers.map(admin => (
                    <div key={admin.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Shield className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{admin.email || `User ID: ${admin.user_id.substring(0, 8)}...`}</p>
                          <p className="text-xs text-muted-foreground">
                            Admin since {new Date(admin.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeAdminRole(admin.user_id, admin.email || "this user")}
                        disabled={adminUsers.length === 1}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
