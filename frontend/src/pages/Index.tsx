import { motion } from "framer-motion";
import { PoseTrainer } from "@/components/trainer/PoseTrainer";

const GUEST_USER_ID = "guest";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <section className="bg-hero text-hero-foreground">
        <div className="container py-10 sm:py-14">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.45 }}
          >
            <p className="text-sm uppercase tracking-[0.3em] text-hero-foreground/70">Captain Dumbell</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Camera-guided workouts, ready when you are.
            </h1>
            <p className="mt-4 max-w-xl text-base text-hero-foreground/80 sm:text-lg">
              Train pushups, squats, presses and more with real-time feedback. Jump in directly — no sign-in required.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="container py-8 sm:py-10">
        <PoseTrainer userId={GUEST_USER_ID} />
      </section>
    </main>
  );
};

export default Index;
