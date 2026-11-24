"use client";

import { useId, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimulationStore } from "@/store/simulation-store";
import { cn } from "@/lib/utils";

/**
 * Queues a pickup → drop-off mission via the engine's add-mission command.
 * The engine validates the stations; errors surface in the command toast.
 */
export function NewMissionForm({
  defaultPickup,
  className,
  compact = false,
}: {
  defaultPickup?: string;
  className?: string;
  compact?: boolean;
}) {
  const stations = useSimulationStore((s) => s.snapshot.layout.stations);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const pickups = stations.filter((s) => s.kind === "pickup");
  const dropoffs = stations.filter((s) => s.kind === "dropoff");
  const [pickup, setPickup] = useState<string>(defaultPickup ?? pickups[0]?.id ?? "");
  const [dropoff, setDropoff] = useState<string>(dropoffs[0]?.id ?? "");
  const pickupId = useId();
  const dropoffId = useId();

  // Scenario switches change the station set; fall back to valid choices.
  const pickupValue = pickups.some((s) => s.id === pickup) ? pickup : (pickups[0]?.id ?? "");
  const dropoffValue = dropoffs.some((s) => s.id === dropoff) ? dropoff : (dropoffs[0]?.id ?? "");

  return (
    <form
      className={cn("flex flex-wrap items-end gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ type: "add-mission", pickupStationId: pickupValue, dropoffStationId: dropoffValue });
      }}
    >
      <div className="flex flex-col gap-1">
        {!compact ? (
          <label htmlFor={pickupId} className="label-caps">
            Pickup
          </label>
        ) : null}
        <Select value={pickupValue} onValueChange={setPickup}>
          <SelectTrigger id={pickupId} size="sm" aria-label="Pickup station" className="w-24 border-line font-mono text-xs text-cyan">
            <SelectValue>{pickupValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pickups.map((s) => (
              <SelectItem key={s.id} value={s.id} className="font-mono text-xs">
                {s.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ArrowRight className="mb-2 size-3.5 text-text-dim" aria-hidden />
      <div className="flex flex-col gap-1">
        {!compact ? (
          <label htmlFor={dropoffId} className="label-caps">
            Drop-off
          </label>
        ) : null}
        <Select value={dropoffValue} onValueChange={setDropoff}>
          <SelectTrigger id={dropoffId} size="sm" aria-label="Drop-off station" className="w-24 border-line font-mono text-xs text-lime">
            <SelectValue>{dropoffValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {dropoffs.map((s) => (
              <SelectItem key={s.id} value={s.id} className="font-mono text-xs">
                {s.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={!pickupValue || !dropoffValue}>
        <Plus />
        Queue mission
      </Button>
    </form>
  );
}
