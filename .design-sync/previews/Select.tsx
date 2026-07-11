import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "bushel-board-app";

export const Open = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <Select defaultOpen defaultValue="canola">
      <SelectTrigger style={{ width: 220 }}>
        <SelectValue placeholder="Choose a grain" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Oilseeds</SelectLabel>
          <SelectItem value="canola">Canola</SelectItem>
          <SelectItem value="flaxseed">Flaxseed</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Cereals</SelectLabel>
          <SelectItem value="wheat">Wheat</SelectItem>
          <SelectItem value="barley">Barley</SelectItem>
          <SelectItem value="oats">Oats</SelectItem>
          <SelectItem value="durum">Amber Durum</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

export const Closed = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <Select defaultValue="wheat">
      <SelectTrigger style={{ width: 220 }}>
        <SelectValue placeholder="Choose a grain" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="wheat">Wheat</SelectItem>
        <SelectItem value="canola">Canola</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
