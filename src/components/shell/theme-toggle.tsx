"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={mounted && resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="shrink-0"
    >
      {mounted && resolvedTheme === "light" ? (
        <Moon className="h-[1.1rem] w-[1.1rem]" aria-hidden />
      ) : (
        <Sun className="h-[1.1rem] w-[1.1rem]" aria-hidden />
      )}
    </Button>
  );
}
