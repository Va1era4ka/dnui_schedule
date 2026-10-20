import type { Me, Notify } from "./api";
import { NotifyBlock } from "./Notify";
import { askWriteAccess } from "./telegram";
import { Block, ErrorText, SectionLabel, TITLE } from "./ui";

/** Настройки: группа и уведомления. Переносы и выходные ведёт редактор в админке - тут их нет. */
export function Settings({ me, title, error, onChange, onAllowed, onPickGroup }: {
  me: Me;
  title: string;
  error: string;
  onChange: (patch: Partial<Notify>) => void;
  /** разрешили боту писать - сервер узнает об этом от Telegram, а экран обновим сразу */
  onAllowed: () => void;
  onPickGroup: () => void;
}) {
  const silent = (me.digest_on || me.next_up_on) && !me.can_write;
  return (
    <div className="space-y-4 px-5 pb-6">
      <h1 className={`${TITLE} pt-3.5 pb-0.5`}>Настройки</h1>
      <div>
        <SectionLabel>Группа</SectionLabel>
        <Block>
          <button onClick={onPickGroup} className="flex w-full items-center gap-3 px-[18px] py-4 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium">{title}</span>
              <span className="block text-[12.5px] text-muted">код {me.group}</span>
            </span>
            <span className="text-[14.5px] font-medium text-primary">Сменить</span>
          </button>
        </Block>
      </div>
      <div>
        <SectionLabel>Уведомления</SectionLabel>
        <NotifyBlock value={me} onChange={onChange} />
        <p className="mt-2 ml-1 text-[12.5px] text-muted">Приходят в чат с ботом. Если завтра пар нет, сводки не будет.</p>
      </div>
      {silent && (
        <div className="rounded-[22px] bg-tertiary-container p-[18px] text-on-tertiary-container">
          <p className="text-[12.5px]">Бот пока не может вам писать — уведомления не придут.</p>
          <button className="mt-2 text-[14.5px] font-semibold" onClick={() => askWriteAccess().then((ok) => ok && onAllowed())}>
            Разрешить
          </button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
