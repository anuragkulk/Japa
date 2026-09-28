import { useEffect } from "react";
import { Flower2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { usePath, parseRoute, navigate } from "@/lib/router";
import { Login, Signup } from "@/screens/Auth";
import { Home } from "@/screens/Home";
import { JapaRecords } from "@/screens/JapaRecords";
import { AddJapa } from "@/screens/AddJapa";
import { People } from "@/screens/People";
import { AddPerson } from "@/screens/AddPerson";
import { Milestones } from "@/screens/Milestones";
import { AddMilestone } from "@/screens/AddMilestone";
import { Devotionals } from "@/screens/Devotionals";
import { AddDevotional } from "@/screens/AddDevotional";
import { AddDevotionalChoice } from "@/screens/AddDevotionalChoice";
import { TypeDevotional } from "@/screens/TypeDevotional";
import { DevotionalViewer } from "@/screens/DevotionalViewer";

function Splash() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-accent/40 bg-card text-primary shadow-soft">
        <Flower2 className="size-7" />
      </div>
      <p className="font-display text-3xl font-semibold text-foreground">Japa</p>
    </div>
  );
}

function Routes() {
  const { status } = useAuth();
  const path = usePath();
  const route = parseRoute(path);

  // Single authoritative gate: guests see only auth screens; authed users never
  // land on login/signup. Every protected route resolves to a real screen.
  useEffect(() => {
    if (status === "loading") return;
    const authRoute = route.name === "login" || route.name === "signup";
    if (status === "guest" && !authRoute) navigate("/login", true);
    else if (status === "authed" && (authRoute || route.name === "notfound")) navigate("/home", true);
  }, [status, route.name]);

  if (status === "loading") return <Splash />;

  if (status === "guest") {
    return route.name === "signup" ? <Signup /> : <Login />;
  }

  switch (route.name) {
    case "home":
      return <Home />;
    case "japa":
      return <JapaRecords />;
    case "japa-add":
      return <AddJapa />;
    case "japa-edit":
      return <AddJapa editId={route.id} />;
    case "people":
      return <People />;
    case "person-add":
      return <AddPerson />;
    case "person-edit":
      return <AddPerson editId={route.id} />;
    case "milestone":
      return <Milestones />;
    case "milestone-add":
      return <AddMilestone />;
    case "milestone-edit":
      return <AddMilestone editId={route.id} />;
    case "devotionals":
      return <Devotionals />;
    case "devotional-add":
      return <AddDevotionalChoice />;
    case "devotional-add-image":
      return <AddDevotional />;
    case "devotional-add-text":
      return <TypeDevotional />;
    case "devotional-edit-text":
      return <TypeDevotional editId={route.id} />;
    case "devotional-view":
      return <DevotionalViewer id={route.id} />;
    default:
      return <Home />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
