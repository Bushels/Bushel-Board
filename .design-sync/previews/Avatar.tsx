import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "bushel-board-app";

export const Default = () => (
  <Avatar>
    <AvatarImage src="/avatars/kyle.png" alt="Kyle B." />
    <AvatarFallback>KB</AvatarFallback>
  </Avatar>
);

export const FallbackOnly = () => (
  <Avatar>
    <AvatarFallback>AB</AvatarFallback>
  </Avatar>
);

export const Sizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Avatar size="sm">
      <AvatarFallback>SK</AvatarFallback>
    </Avatar>
    <Avatar size="default">
      <AvatarFallback>MB</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>AB</AvatarFallback>
    </Avatar>
  </div>
);

export const Initials = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <Avatar>
      <AvatarFallback>KB</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>RW</AvatarFallback>
    </Avatar>
  </div>
);

export const Group = () => (
  <AvatarGroup>
    <Avatar>
      <AvatarFallback>KB</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>RW</AvatarFallback>
    </Avatar>
    <AvatarGroupCount>+5</AvatarGroupCount>
  </AvatarGroup>
);
