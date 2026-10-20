import { SOON_MIN } from "../../shared/events";
import type { Notify } from "./api";
import { Block, Divider, Segmented, SwitchRow } from "./ui";

const LEADS = [5, 10, 15];

/** Уведомления - тот же блок и те же слова, что в настройках приложения. Общий у онбординга и настроек. */
export function NotifyBlock({ value, onChange }: { value: Notify; onChange: (patch: Partial<Notify>) => void }) {
  return (
    <Block>
      <SwitchRow
        title="Вечером — что завтра"
        subtitle="список пар на следующий день"
        on={value.digest_on}
        onChange={(on) => onChange({ digest_on: on })}
      />
      {value.digest_on && (
        <>
          <Divider />
          <label className="flex items-center py-2 pr-3 pl-[18px]">
            <span className="flex-1 text-[14.5px] font-medium">Время</span>
            <input
              type="time"
              required
              value={value.digest_at}
              // пустое бывает, пока стирают цифры на клавиатуре; колесо iOS даёт только целое время
              onChange={(e) => e.target.value && onChange({ digest_at: e.target.value })}
              className="h-11 rounded-xl bg-highest px-3 text-base font-semibold text-primary"
            />
          </label>
        </>
      )}
      <Divider />
      <SwitchRow
        title="О следующей паре"
        subtitle={`до конца текущей и за ${SOON_MIN} минут до первой`}
        on={value.next_up_on}
        onChange={(on) => onChange({ next_up_on: on })}
      />
      {value.next_up_on && (
        <>
          <Divider />
          <div className="flex items-center gap-3 py-3 pr-3 pl-[18px]">
            <span className="flex-1 text-[14.5px] font-medium">За сколько минут</span>
            <Segmented
              options={LEADS.map(String)}
              selected={LEADS.indexOf(value.lead_min)}
              onSelect={(i) => onChange({ lead_min: LEADS[i] })}
              className="w-[170px]"
            />
          </div>
        </>
      )}
    </Block>
  );
}
