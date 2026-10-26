import {
  BellIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
  UserIcon,
} from "lucide-react"
import { Link } from "react-router"

import { ButtonLink } from "@/components/common/button-link"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/auth"

export function AccountMenu() {
  const { user, isAdmin, signOut } = useAuth()

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink variant="ghost" size="sm" to="/login">
          Sign in
        </ButtonLink>
        <ButtonLink size="sm" to="/signup">
          Create account
        </ButtonLink>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Account menu for ${user.displayName}`}
          />
        }
      >
        <UserAvatar name={user.displayName} src={user.avatarUrl} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate text-sm font-medium">
            {user.displayName}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            @{user.namespace}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/dashboard" />}>
            <LayoutDashboardIcon /> Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/notifications" />}>
            <BellIcon /> Notifications
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/publish" />}>
            <UploadIcon /> Publish
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to={`/@${user.namespace}`} />}>
            <UserIcon /> My profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/settings" />}>
            <SettingsIcon /> Settings
          </DropdownMenuItem>
          {isAdmin ? (
            <DropdownMenuItem render={<Link to="/admin" />}>
              <ShieldIcon /> Admin
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
