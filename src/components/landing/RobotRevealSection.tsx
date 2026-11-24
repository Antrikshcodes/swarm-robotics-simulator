"use client";

import { motion } from "framer-motion";
import { Radar, Eye, Disc, Package } from "lucide-react";

const ROBOT_FEATURES = [
  {
    number: "01",
    title: "360° DYNAMIC LiDAR TURRET",
    desc: "Precision optical transceiver operating at 20Hz, providing continuous point-cloud spatial awareness and obstacle classification in tight warehouse corridors.",
    icon: Radar,
    accent: "#40C8E8",
  },
  {
    number: "02",
    title: "INTELLIGENT TELEMETRY OLED",
    desc: "Curved front display communicating real-time intent, battery health, and peer-to-peer priority signals to nearby warehouse operators and robotic units.",
    icon: Eye,
    accent: "#B7F34A",
  },
  {
    number: "03",
    title: "TORQUE-VECTORING WHEELS",
    desc: "Industrial polymer differential drive units with sub-millimeter encoder feedback, executing instantaneous yield halts and zero-turn radius pivots.",
    icon: Disc,
    accent: "#40C8E8",
  },
  {
    number: "04",
    title: "SECURE CARGO PLATFORM",
    desc: "Integrated payload bed with electromagnetic latching and verifiable single-owner package custody audit logging across all mission phases.",
    icon: Package,
    accent: "#B7F34A",
  },
];

export function RobotRevealSection() {
  return (
    <section
      id="robot-reveal"
      className="relative min-h-screen w-full flex flex-col justify-center py-24 px-6 md:px-12 lg:px-20 border-t border-white/[0.08] overflow-hidden"
    >
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-14 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-2 mb-3"
          >
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#89969C] uppercase">
              SCENE 02 {"//"} THE AUTONOMOUS MACHINE
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-4xl sm:text-6xl font-black tracking-[-0.03em] text-[#F2F4F3] leading-[0.96] mb-4"
          >
            HARDWARE DESIGNED <br />
            FOR AUTONOMY.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-base sm:text-lg text-[#89969C] leading-relaxed"
          >
            A purpose-built autonomous mobile robot engineered with redundant safety sensors,
            deterministic motor controllers, and expressive visual communication.
          </motion.p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {ROBOT_FEATURES.map((feat, index) => {
            const Icon = feat.icon;

            return (
              <motion.div
                key={feat.number}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="group relative rounded-2xl border border-white/10 bg-[#121A1E]/70 p-6 backdrop-blur-md shadow-xl transition-all duration-300 hover:border-[#40C8E8]/40 hover:bg-[#121A1E] hover:-translate-y-1"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <span className="font-mono text-xs tracking-wider font-semibold text-[#89969C] group-hover:text-[#F2F4F3] transition-colors">
                    {feat.number}
                  </span>
                  <div
                    className="size-8 rounded-lg flex items-center justify-center border border-white/10 bg-[#192329] transition-transform group-hover:scale-110"
                    style={{ color: feat.accent }}
                  >
                    <Icon className="size-4" />
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-mono text-sm sm:text-base font-bold tracking-tight text-[#F2F4F3] mb-2 leading-snug">
                  {feat.title}
                </h3>

                {/* Description */}
                <p className="text-xs sm:text-[13px] text-[#89969C] leading-relaxed">
                  {feat.desc}
                </p>

                {/* Accent line on hover */}
                <div
                  className="absolute bottom-0 left-6 right-6 h-[2px] transition-transform duration-300 scale-x-0 group-hover:scale-x-100 origin-left"
                  style={{ backgroundColor: feat.accent }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
