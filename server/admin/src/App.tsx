import { useEffect, useState } from "react";
import { api } from "./api";
import { Group } from "./Group";
import { Groups, NewGroup } from "./Groups";
import { Link } from "./ui";

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  const [email, setEmail] = useState("");
  useEffect(() => {
    api.me().then((r) => setEmail(r.email), () => {});
  }, []);

  const [, group, tab = ""] = path.match(/^\/admin\/g\/([a-z0-9]+)(?:\/([a-z]+))?/) ?? [];
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="flex items-baseline justify-between gap-4 py-5">
        <Link to="/admin/" className="text-lg font-bold">
          Расписание <span className="font-normal text-muted">· админка</span>
        </Link>
        <span className="truncate text-xs text-muted">{email}</span>
      </header>
      {group ? <Group key={group} code={group} tab={tab} /> : path === "/admin/new" ? <NewGroup /> : <Groups />}
    </div>
  );
}
