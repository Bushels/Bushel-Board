import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Button,
} from "bushel-board-app";

export const Open = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Switch grain
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" style={{ width: 220 }}>
        <DropdownMenuLabel>Prairie grains · Week 31</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Canola</DropdownMenuItem>
        <DropdownMenuItem>Wheat</DropdownMenuItem>
        <DropdownMenuItem>Barley</DropdownMenuItem>
        <DropdownMenuItem>Oats</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Clear selection</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export const Closed = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Switch grain
        </Button>
      </DropdownMenuTrigger>
    </DropdownMenu>
  </div>
);
