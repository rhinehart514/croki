"use client";

import { ArrowUpRight, GitFork, Menu } from "lucide-react";
import { DroverWordmark } from "@/components/drover-wordmark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const githubUrl = "https://github.com/rhinehart514/drover";

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand-link" href="#top" aria-label="Drover home">
        <DroverWordmark />
      </a>

      <nav className="desktop-nav" aria-label="Primary navigation">
        <a href="#machine">The machine</a>
        <a href="#wall">Founder wall</a>
        <a href="#local">Run locally</a>
        <a href="#pricing">Pricing</a>
      </nav>

      <Button
        className="header-source"
        variant="outline"
        size="lg"
        render={
          <a href={githubUrl} target="_blank" rel="noreferrer" />
        }
      >
        <GitFork data-icon="inline-start" />
        View source
        <ArrowUpRight data-icon="inline-end" />
      </Button>

      <Sheet>
        <SheetTrigger
          render={
            <Button
              className="mobile-menu-trigger"
              variant="outline"
              size="icon-lg"
              aria-label="Open navigation"
            />
          }
        >
          <Menu />
        </SheetTrigger>
        <SheetContent className="mobile-sheet" side="right">
          <SheetHeader>
            <SheetTitle>
              <DroverWordmark />
            </SheetTitle>
            <SheetDescription>
              A local-first experiment machine for founders.
            </SheetDescription>
          </SheetHeader>
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <SheetClose render={<a href="#machine" />}>The machine</SheetClose>
            <SheetClose render={<a href="#wall" />}>Founder wall</SheetClose>
            <SheetClose render={<a href="#local" />}>Run locally</SheetClose>
            <SheetClose render={<a href="#pricing" />}>Pricing</SheetClose>
          </nav>
          <div className="mobile-sheet-footer">
            <Button
              className="mobile-source"
              size="lg"
              render={
                <a href={githubUrl} target="_blank" rel="noreferrer" />
              }
            >
              <GitFork data-icon="inline-start" />
              View source
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
