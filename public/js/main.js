// ================================
  // PHOENIX COINS & PHANTOM MARKET
  // ================================
  
  initPhantomMarket() {
    this.phantomPowerUps = {
      "emergency-flash": {
        name: "Emergency Flash",
        cost: 100,
        unlockTime: 30
      },
      "echo-scanner": {
        name: "Echo Scanner",
        cost: 150,
        unlockTime: 60
      },
      "neural-shield": {
        name: "Neural Shield",
        cost: 200,
        unlockTime: 90
      },
      "time-fracture": {
        name: "Time Fracture",
        cost: 250,
        unlockTime: 120
      }
    };

    this.phantomShopStart = Date.now();
    this.phantomPurchasedPowers = [];

    const shop = document.getElementById("power-shop");
    const openButton = document.getElementById("open-power-shop");
    const closeButtons = document.querySelectorAll(
      "[data-close-power-shop]"
    );

    openButton?.addEventListener("click", () => {
      this.updatePhantomShop();
      shop?.classList.add("open");
      shop?.setAttribute("aria-hidden", "false");
    });

    closeButtons.forEach(button => {
      button.addEventListener("click", () => {
        shop?.classList.remove("open");
        shop?.setAttribute("aria-hidden", "true");
      });
    });

    document.querySelectorAll("[data-power]").forEach(button => {
      button.addEventListener("click", () => {
        this.purchasePhantomPower(button.dataset.power);
      });
    });

    this.updatePhantomShop();
  }

  updatePhantomShop() {
    const balance = document.getElementById("shop-coins");
    const wallet = document.getElementById("phoenix-coins");

    // Read the balance from the existing storage system.
    const coins = Number(
      wallet?.textContent?.replace(/[^\d]/g, "") || 0
    );

    if (balance) balance.textContent = coins;

    const elapsed = (Date.now() - this.phantomShopStart) / 1000;

    document.querySelectorAll("[data-power]").forEach(button => {
      const power = this.phantomPowerUps[button.dataset.power];

      if (!power) return;

      const unlocked = elapsed >= power.unlockTime;
      const purchased = this.phantomPurchasedPowers.includes(
        button.dataset.power
      );

      button.disabled = !unlocked || purchased;

      if (purchased) {
        button.textContent = `${power.name} — Purchased`;
      } else if (!unlocked) {
        button.textContent =
          `${power.name} — Unlocks in ${Math.ceil(
            power.unlockTime - elapsed
          )}s`;
      } else {
        button.textContent =
          `${power.name} — ${power.cost} Coins`;
      }
    });
  }

  purchasePhantomPower(powerId) {
    const power = this.phantomPowerUps[powerId];
    const message = document.getElementById("power-shop-message");

    if (!power) return;

    const elapsed = (Date.now() - this.phantomShopStart) / 1000;

    if (elapsed < power.unlockTime) {
      if (message) {
        message.textContent = "This power-up is still locked.";
      }
      return;
    }

    if (this.phantomPurchasedPowers.includes(powerId)) {
      if (message) {
        message.textContent = "You already purchased this power-up.";
      }
      return;
    }

    const wallet = document.getElementById("phoenix-coins");
    const currentCoins = Number(
      wallet?.textContent?.replace(/[^\d]/g, "") || 0
    );

    if (currentCoins < power.cost) {
      if (message) {
        message.textContent = "Not enough Phoenix Coins!";
      }
      return;
    }

    // Deduct coins through the existing storage system.
    const success = Store.spendCoins(power.cost);

    if (success === false) {
      if (message) {
        message.textContent = "Purchase failed. Please try again.";
      }
      return;
    }

    this.phantomPurchasedPowers.push(powerId);

    // Notify the game engine that a power-up was purchased.
    window.dispatchEvent(
      new CustomEvent("phoenix:powerup-purchased", {
        detail: {
          id: powerId,
          name: power.name,
          cost: power.cost
        }
      })
    );

    if (message) {
      message.textContent = `${power.name} purchased successfully!`;
    }

    this.updatePhantomShop();
  }
