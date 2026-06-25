import { useAuth } from "../store/auth";
import { useUI } from "../store/ui";
import { useI18n } from "../lib/i18n";
import Avatar from "./Avatar";

// Bottom-left user panel: avatar, name, custom status, settings gear.
export default function UserPanel() {
  const { user } = useAuth();
  const { openModal } = useUI();
  const { t } = useI18n();
  if (!user) return null;

  return (
    <div className="flex items-center gap-2 bg-discord-rail px-2 py-1.5">
      <Avatar user={user} size={32} status="ONLINE" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-white">
          {user.displayName ?? user.username}
        </div>
        <div className="truncate text-xs text-discord-muted">
          {user.customStatus || `${user.username}#${user.discriminator}`}
        </div>
      </div>
      <button
        onClick={() => openModal("settings")}
        title={t("settings.title")}
        className="rounded p-1.5 text-discord-muted transition hover:bg-discord-hover hover:text-white"
      >
        ⚙
      </button>
    </div>
  );
}
