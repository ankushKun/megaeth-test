import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Megaplace } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Constants matching the contract
const CANVAS_RES = 1048576; // 2^20
const TILE_SIZE = 512;
const MAX_REGION_SIZE = 10000;

// Helper functions for time manipulation
async function getCurrentTime(): Promise<number> {
  const block = await ethers.provider.getBlock('latest');
  return block!.timestamp;
}

async function increaseTime(seconds: number): Promise<void> {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

describe("Megaplace", function () {
  let megaplace: Megaplace;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let user3: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const MegaplaceFactory = await ethers.getContractFactory("Megaplace");
    megaplace = await MegaplaceFactory.deploy() as unknown as Megaplace;
    await megaplace.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await megaplace.owner()).to.equal(owner.address);
    });

    it("Should accept ETH via receive function", async function () {
      const amount = ethers.parseEther("1.0");
      await owner.sendTransaction({
        to: await megaplace.getAddress(),
        value: amount,
      });

      expect(await ethers.provider.getBalance(await megaplace.getAddress())).to.equal(amount);
    });

    it("Should have correct default configuration", async function () {
      const [rateLimitSeconds, rateLimitPixels, premiumCost, premiumDuration] = await megaplace.getConfig();
      expect(rateLimitSeconds).to.equal(5); // 5 seconds cooldown
      expect(rateLimitPixels).to.equal(15); // 15 pixels per cooldown
      expect(premiumCost).to.equal(ethers.parseEther("0.01"));
      expect(premiumDuration).to.equal(2 * 60 * 60); // 2 hours
    });
  });

  describe("Ownership Transfer (Ownable2Step)", function () {
    it("Should allow owner to initiate ownership transfer", async function () {
      await megaplace.connect(owner).transferOwnership(user1.address);
      expect(await megaplace.pendingOwner()).to.equal(user1.address);
      expect(await megaplace.owner()).to.equal(owner.address); // Still owner until accepted
    });

    it("Should allow pending owner to accept ownership", async function () {
      await megaplace.connect(owner).transferOwnership(user1.address);
      await megaplace.connect(user1).acceptOwnership();
      expect(await megaplace.owner()).to.equal(user1.address);
    });

    it("Should reject non-pending owner accepting ownership", async function () {
      await megaplace.connect(owner).transferOwnership(user1.address);
      await expect(megaplace.connect(user2).acceptOwnership())
        .to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");
    });
  });

  describe("placePixel", function () {
    it("Should place a pixel successfully", async function () {
      const x = 100;
      const y = 200;
      const color = 0xff0000; // Red

      const tx = await megaplace.connect(user1).placePixel(x, y, color);
      const receipt = await tx.wait();

      // Check event was emitted
      expect(receipt).to.not.be.null;

      const pixel = await megaplace.getPixel(x, y);
      expect(pixel.color).to.equal(color);
      expect(pixel.placedBy).to.equal(user1.address);
      expect(pixel.timestamp).to.be.gt(0);
    });

    it("Should reject invalid x coordinate (>= CANVAS_RES)", async function () {
      await expect(megaplace.connect(user1).placePixel(CANVAS_RES, 0, 0xff0000))
        .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates")
        .withArgs(CANVAS_RES, 0);

      await expect(megaplace.connect(user1).placePixel(CANVAS_RES + 1, 0, 0xff0000))
        .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");
    });

    it("Should reject invalid y coordinate (>= CANVAS_RES)", async function () {
      await expect(megaplace.connect(user1).placePixel(0, CANVAS_RES, 0xff0000))
        .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates")
        .withArgs(0, CANVAS_RES);

      await expect(megaplace.connect(user1).placePixel(0, CANVAS_RES + 1, 0xff0000))
        .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");
    });

    it("Should enforce rate limit: after 15 pixels, wait 5 seconds", async function () {
      // Use batch to place 15 pixels in single transaction (hits limit, starts cooldown)
      const x = Array(15).fill(0).map((_, i) => i);
      const y = Array(15).fill(0);
      const colors = Array(15).fill(0xff0000);
      await megaplace.connect(user1).placePixelBatch(x, y, colors);

      // Verify cooldown state
      const pixelsPlaced = await megaplace.pixelsPlacedSinceCooldown(user1.address);
      const lastCooldown = await megaplace.lastCooldownStart(user1.address);
      expect(pixelsPlaced).to.equal(15);
      expect(lastCooldown).to.be.gt(0);

      // 16th pixel should fail immediately (in cooldown)
      await expect(megaplace.connect(user1).placePixel(15, 0, 0x00ff00))
        .to.be.revertedWithCustomError(megaplace, "RateLimitExceeded");

      // Advance time by 3 seconds (not enough)
      await increaseTime(3);

      // Still should fail
      await expect(megaplace.connect(user1).placePixel(15, 0, 0x00ff00))
        .to.be.revertedWithCustomError(megaplace, "RateLimitExceeded");

      // Advance time by 2 more seconds (total 5 seconds from batch)
      await increaseTime(2);

      // Now should succeed (cooldown expired, counter reset)
      await expect(megaplace.connect(user1).placePixel(15, 0, 0x00ff00))
        .to.not.be.reverted;
    });

    it("Should allow placing up to 15 pixels without cooldown", async function () {
      // All 15 pixels should succeed without any cooldown
      for (let i = 0; i < 15; i++) {
        await expect(megaplace.connect(user1).placePixel(i, 0, 0xff0000))
          .to.not.be.reverted;
      }
    });

    it("Should allow different users to place pixels without rate limit conflicts", async function () {
      await megaplace.connect(user1).placePixel(0, 0, 0xff0000);
      await expect(megaplace.connect(user2).placePixel(1, 1, 0x00ff00))
        .to.not.be.reverted;
    });

    it("Should allow premium users to bypass rate limit", async function () {
      // Grant premium access
      await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

      // Place multiple pixels without waiting
      await megaplace.connect(user1).placePixel(0, 0, 0xff0000);
      await megaplace.connect(user1).placePixel(1, 1, 0x00ff00);
      await megaplace.connect(user1).placePixel(2, 2, 0x0000ff);

      const pixel1 = await megaplace.getPixel(0, 0);
      const pixel2 = await megaplace.getPixel(1, 1);
      const pixel3 = await megaplace.getPixel(2, 2);

      expect(pixel1.color).to.equal(0xff0000);
      expect(pixel2.color).to.equal(0x00ff00);
      expect(pixel3.color).to.equal(0x0000ff);
    });

    it("Should allow overwriting pixels", async function () {
      await megaplace.connect(user1).placePixel(5, 5, 0xff0000);
      await increaseTime(15);
      await megaplace.connect(user2).placePixel(5, 5, 0x00ff00);

      const pixel = await megaplace.getPixel(5, 5);
      expect(pixel.color).to.equal(0x00ff00);
      expect(pixel.placedBy).to.equal(user2.address);
    });

    it("Should store color 0 as-is (transparent/unset - handled by frontend)", async function () {
      await megaplace.connect(user1).placePixel(10, 10, 0x000000);

      const pixel = await megaplace.getPixel(10, 10);
      expect(pixel.color).to.equal(0); // Color 0 stored as-is (frontend converts black to 0x010101)
      expect(pixel.placedBy).to.equal(user1.address);
      expect(pixel.timestamp).to.be.gt(0);
    });

    it("Should allow placing color 0 to 'erase' a pixel", async function () {
      // First place a colored pixel
      await megaplace.connect(user1).placePixel(15, 15, 0xff0000);
      let pixel = await megaplace.getPixel(15, 15);
      expect(pixel.color).to.equal(0xff0000);

      // Erase it by placing color 0
      await increaseTime(15);
      await megaplace.connect(user2).placePixel(15, 15, 0);
      pixel = await megaplace.getPixel(15, 15);
      expect(pixel.color).to.equal(0); // Now transparent/unset
      expect(pixel.placedBy).to.equal(user2.address); // Records who erased it
    });

    it("Should set lastCooldownStart when 15th pixel is placed", async function () {
      // Place 14 pixels - lastCooldownStart should still be 0
      for (let i = 0; i < 14; i++) {
        await megaplace.connect(user1).placePixel(i, 0, 0xff0000);
      }
      expect(await megaplace.lastCooldownStart(user1.address)).to.equal(0);

      // Place 15th pixel - now lastCooldownStart should be set
      const tx = await megaplace.connect(user1).placePixel(14, 0, 0xff0000);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      const lastCooldownStart = await megaplace.lastCooldownStart(user1.address);
      expect(lastCooldownStart).to.equal(block!.timestamp);
    });
  });

  describe("placePixelBatch", function () {
    it("Should place multiple pixels in batch", async function () {
      const x = [0, 1, 2];
      const y = [0, 1, 2];
      const colors = [0xff0000, 0x00ff00, 0x0000ff];

      await expect(megaplace.connect(user1).placePixelBatch(x, y, colors))
        .to.emit(megaplace, "PixelsBatchPlaced")
        .withArgs(user1.address, 3, await getCurrentTime() + 1);

      const pixel1 = await megaplace.getPixel(0, 0);
      const pixel2 = await megaplace.getPixel(1, 1);
      const pixel3 = await megaplace.getPixel(2, 2);

      expect(pixel1.color).to.equal(0xff0000);
      expect(pixel2.color).to.equal(0x00ff00);
      expect(pixel3.color).to.equal(0x0000ff);
    });

    it("Should emit PixelPlaced event for each pixel in batch", async function () {
      const x = [10, 11];
      const y = [20, 21];
      const colors = [0xff0000, 0x00ff00];

      const tx = await megaplace.connect(user1).placePixelBatch(x, y, colors);
      const receipt = await tx.wait();

      const pixelPlacedEvents = receipt!.logs.filter(
        (log: any) => log.fragment?.name === "PixelPlaced"
      );

      expect(pixelPlacedEvents.length).to.equal(2);
    });

    it("Should store color 0 as-is in batch (transparent/unset)", async function () {
      const x = [30, 31];
      const y = [40, 41];
      const colors = [0x000000, 0xff0000]; // Transparent and red

      await megaplace.connect(user1).placePixelBatch(x, y, colors);

      const pixel1 = await megaplace.getPixel(30, 40);
      const pixel2 = await megaplace.getPixel(31, 41);

      expect(pixel1.color).to.equal(0); // Color 0 stored as-is (frontend handles black conversion)
      expect(pixel2.color).to.equal(0xff0000);
    });

    it("Should allow erasing multiple pixels in batch with color 0", async function () {
      // First place some colored pixels
      const x = [50, 51, 52];
      const y = [60, 61, 62];
      const colors = [0xff0000, 0x00ff00, 0x0000ff];
      await megaplace.connect(user1).placePixelBatch(x, y, colors);

      // Verify pixels were placed
      expect((await megaplace.getPixel(50, 60)).color).to.equal(0xff0000);
      expect((await megaplace.getPixel(51, 61)).color).to.equal(0x00ff00);
      expect((await megaplace.getPixel(52, 62)).color).to.equal(0x0000ff);

      // Erase them by placing color 0
      await increaseTime(15);
      const eraseColors = [0, 0, 0];
      await megaplace.connect(user2).placePixelBatch(x, y, eraseColors);

      // Verify pixels were erased
      expect((await megaplace.getPixel(50, 60)).color).to.equal(0);
      expect((await megaplace.getPixel(51, 61)).color).to.equal(0);
      expect((await megaplace.getPixel(52, 62)).color).to.equal(0);
    });

    it("Should reject array length mismatch", async function () {
      await expect(
        megaplace.connect(user1).placePixelBatch([0, 1], [0], [0xff0000, 0x00ff00])
      ).to.be.revertedWithCustomError(megaplace, "ArrayLengthMismatch");

      await expect(
        megaplace.connect(user1).placePixelBatch([0], [0, 1], [0xff0000])
      ).to.be.revertedWithCustomError(megaplace, "ArrayLengthMismatch");
    });

    it("Should reject empty batch", async function () {
      await expect(
        megaplace.connect(user1).placePixelBatch([], [], [])
      ).to.be.revertedWithCustomError(megaplace, "InvalidBatchSize")
        .withArgs(0, 1, 100);
    });

    it("Should reject batch larger than 100 pixels", async function () {
      const x = Array(101).fill(0).map((_, i) => i % 1000);
      const y = Array(101).fill(0);
      const colors = Array(101).fill(0xff0000);

      await expect(
        megaplace.connect(user1).placePixelBatch(x, y, colors)
      ).to.be.revertedWithCustomError(megaplace, "InvalidBatchSize")
        .withArgs(101, 1, 100);
    });

    it("Should reject batch with invalid coordinates", async function () {
      await expect(
        megaplace.connect(user1).placePixelBatch([CANVAS_RES], [0], [0xff0000])
      ).to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");

      await expect(
        megaplace.connect(user1).placePixelBatch([0, 1, CANVAS_RES], [0, 1, 0], [0xff0000, 0x00ff00, 0x0000ff])
      ).to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");
    });

    it("Should enforce rate limit for batch placement", async function () {
      // Place 15 pixels in batch (hits the limit, starts cooldown)
      const x = Array(15).fill(0).map((_, i) => i);
      const y = Array(15).fill(0);
      const colors = Array(15).fill(0xff0000);

      await megaplace.connect(user1).placePixelBatch(x, y, colors);

      // Try to place another batch immediately - should fail (in cooldown)
      await expect(
        megaplace.connect(user1).placePixelBatch([15], [0], [0x0000ff])
      ).to.be.revertedWithCustomError(megaplace, "RateLimitExceeded");

      // Advance time by 5 seconds (cooldown period)
      await increaseTime(5);
      await expect(
        megaplace.connect(user1).placePixelBatch([15], [0], [0x0000ff])
      ).to.not.be.reverted;
    });

    it("Should reject batch that would exceed limit", async function () {
      // Place 10 pixels first
      const x1 = Array(10).fill(0).map((_, i) => i);
      const y1 = Array(10).fill(0);
      const colors1 = Array(10).fill(0xff0000);
      await megaplace.connect(user1).placePixelBatch(x1, y1, colors1);

      // Try to place 10 more (would exceed 15 limit) - should fail with remaining capacity
      const x2 = Array(10).fill(0).map((_, i) => i + 10);
      const y2 = Array(10).fill(0);
      const colors2 = Array(10).fill(0x00ff00);
      await expect(
        megaplace.connect(user1).placePixelBatch(x2, y2, colors2)
      ).to.be.revertedWithCustomError(megaplace, "InvalidBatchSize")
        .withArgs(10, 1, 5); // Can only place 5 more
    });

    it("Should allow premium users to place batches without rate limit", async function () {
      await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

      const x1 = [0, 1];
      const y1 = [0, 1];
      const colors1 = [0xff0000, 0x00ff00];

      const x2 = [2, 3];
      const y2 = [2, 3];
      const colors2 = [0x0000ff, 0xffff00];

      await megaplace.connect(user1).placePixelBatch(x1, y1, colors1);
      await megaplace.connect(user1).placePixelBatch(x2, y2, colors2);

      const pixel3 = await megaplace.getPixel(2, 2);
      expect(pixel3.color).to.equal(0x0000ff);
    });

    it("Should accept batch of 100 pixels (with premium access)", async function () {
      // Premium users can bypass rate limit
      await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

      const x = Array(100).fill(0).map((_, i) => i % 100);
      const y = Array(100).fill(0);
      const colors = Array(100).fill(0xff0000);

      await expect(
        megaplace.connect(user1).placePixelBatch(x, y, colors)
      ).to.not.be.reverted;
    });
  });

  describe("Premium Access", function () {
    it("Should grant premium access for 2 hours with correct payment", async function () {
      const tx = await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const expectedExpiry = BigInt(block!.timestamp) + BigInt(2 * 60 * 60); // 2 hours

      const premiumExpiry = await megaplace.premiumAccess(user1.address);
      expect(premiumExpiry).to.equal(expectedExpiry);

      const [hasAccess, expiryTime] = await megaplace.hasPremiumAccess(user1.address);
      expect(hasAccess).to.be.true;
      expect(expiryTime).to.equal(expectedExpiry);
    });

    it("Should emit PremiumAccessGranted event", async function () {
      await expect(megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") }))
        .to.emit(megaplace, "PremiumAccessGranted");
    });

    it("Should reject incorrect payment amount", async function () {
      await expect(
        megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.005") })
      ).to.be.revertedWithCustomError(megaplace, "IncorrectPaymentAmount")
        .withArgs(ethers.parseEther("0.005"), ethers.parseEther("0.01"));

      await expect(
        megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.02") })
      ).to.be.revertedWithCustomError(megaplace, "IncorrectPaymentAmount");

      await expect(
        megaplace.connect(user1).grantPremiumAccess({ value: 0 })
      ).to.be.revertedWithCustomError(megaplace, "IncorrectPaymentAmount");
    });

    it("Should expire premium access after 2 hours", async function () {
      await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

      let [hasAccess] = await megaplace.hasPremiumAccess(user1.address);
      expect(hasAccess).to.be.true;

      // Advance time by 2 hours + 1 second to ensure expiry
      await increaseTime(2 * 60 * 60 + 1);

      [hasAccess] = await megaplace.hasPremiumAccess(user1.address);
      expect(hasAccess).to.be.false;
    });

    it("Should allow owner to grant free premium access", async function () {
      await megaplace.connect(owner).adminGrantPremiumAccess(user1.address);

      const [hasAccess, expiryTime] = await megaplace.hasPremiumAccess(user1.address);
      expect(hasAccess).to.be.true;
      expect(expiryTime).to.be.gt(0);
    });

    it("Should reject non-owner calling adminGrantPremiumAccess", async function () {
      await expect(
        megaplace.connect(user1).adminGrantPremiumAccess(user2.address)
      ).to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to grant premium access to multiple users", async function () {
      await megaplace.connect(owner).adminGrantPremiumAccessBatch([user1.address, user2.address, user3.address]);

      const [hasAccess1] = await megaplace.hasPremiumAccess(user1.address);
      const [hasAccess2] = await megaplace.hasPremiumAccess(user2.address);
      const [hasAccess3] = await megaplace.hasPremiumAccess(user3.address);

      expect(hasAccess1).to.be.true;
      expect(hasAccess2).to.be.true;
      expect(hasAccess3).to.be.true;
    });

    it("Should reject non-owner calling adminGrantPremiumAccessBatch", async function () {
      await expect(
        megaplace.connect(user1).adminGrantPremiumAccessBatch([user2.address, user3.address])
      ).to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");
    });

    it("Should add premium payment to contract balance", async function () {
      const initialBalance = await ethers.provider.getBalance(await megaplace.getAddress());

      await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

      const finalBalance = await ethers.provider.getBalance(await megaplace.getAddress());
      expect(finalBalance - initialBalance).to.equal(ethers.parseEther("0.01"));
    });
  });

  describe("Configuration Management", function () {
    it("Should allow owner to update rate limit seconds", async function () {
      await expect(megaplace.connect(owner).setRateLimitSeconds(30))
        .to.emit(megaplace, "RateLimitUpdated")
        .withArgs(5, 30); // Default is 5 seconds

      expect(await megaplace.rateLimitSeconds()).to.equal(30);
    });

    it("Should allow owner to update rate limit pixels", async function () {
      await expect(megaplace.connect(owner).setRateLimitPixels(30))
        .to.emit(megaplace, "RateLimitPixelsUpdated")
        .withArgs(15, 30); // Default is 15 pixels

      expect(await megaplace.rateLimitPixels()).to.equal(30);
    });

    it("Should allow owner to update premium cost", async function () {
      const newCost = ethers.parseEther("0.05");
      await expect(megaplace.connect(owner).setPremiumCost(newCost))
        .to.emit(megaplace, "PremiumCostUpdated")
        .withArgs(ethers.parseEther("0.01"), newCost);

      expect(await megaplace.premiumCost()).to.equal(newCost);
    });

    it("Should allow owner to update premium duration", async function () {
      const newDuration = 4 * 60 * 60; // 4 hours
      await expect(megaplace.connect(owner).setPremiumDuration(newDuration))
        .to.emit(megaplace, "PremiumDurationUpdated")
        .withArgs(2 * 60 * 60, newDuration);

      expect(await megaplace.premiumDuration()).to.equal(newDuration);
    });

    it("Should reject non-owner updating configuration", async function () {
      await expect(megaplace.connect(user1).setRateLimitSeconds(30))
        .to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");

      await expect(megaplace.connect(user1).setRateLimitPixels(30))
        .to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");

      await expect(megaplace.connect(user1).setPremiumCost(ethers.parseEther("0.05")))
        .to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");

      await expect(megaplace.connect(user1).setPremiumDuration(4 * 60 * 60))
        .to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");
    });

    it("Should use updated rate limit for new placements", async function () {
      // Set rate limit to 1 pixel per 5 seconds (to test rate limiting)
      await megaplace.connect(owner).setRateLimitPixels(1);

      await megaplace.connect(user1).placePixel(0, 0, 0xff0000);

      // Should fail immediately
      await expect(megaplace.connect(user1).placePixel(1, 1, 0x00ff00))
        .to.be.revertedWithCustomError(megaplace, "RateLimitExceeded");

      // Should succeed after 5 seconds
      await increaseTime(5);
      await expect(megaplace.connect(user1).placePixel(1, 1, 0x00ff00))
        .to.not.be.reverted;
    });

    it("Should use updated premium cost", async function () {
      const newCost = ethers.parseEther("0.05");
      await megaplace.connect(owner).setPremiumCost(newCost);

      // Old price should fail
      await expect(megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") }))
        .to.be.revertedWithCustomError(megaplace, "IncorrectPaymentAmount");

      // New price should succeed
      await expect(megaplace.connect(user1).grantPremiumAccess({ value: newCost }))
        .to.not.be.reverted;
    });
  });

  describe("Withdraw", function () {
    it("Should allow owner to withdraw ETH", async function () {
      // Send ETH to contract
      await user1.sendTransaction({
        to: await megaplace.getAddress(),
        value: ethers.parseEther("1.0"),
      });

      const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
      const contractBalance = await ethers.provider.getBalance(await megaplace.getAddress());

      const tx = await megaplace.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
      const finalContractBalance = await ethers.provider.getBalance(await megaplace.getAddress());

      expect(finalContractBalance).to.equal(0);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + contractBalance - gasUsed);
    });

    it("Should reject non-owner calling withdraw", async function () {
      await expect(
        megaplace.connect(user1).withdraw()
      ).to.be.revertedWithCustomError(megaplace, "OwnableUnauthorizedAccount");
    });

    it("Should handle withdrawing when balance is zero", async function () {
      await expect(megaplace.connect(owner).withdraw()).to.not.be.reverted;
    });
  });

  describe("View Functions", function () {
    describe("getPixel", function () {
      it("Should return correct pixel data", async function () {
        const x = 50;
        const y = 75;
        const color = 0xaabbcc;

        await megaplace.connect(user1).placePixel(x, y, color);

        const pixel = await megaplace.getPixel(x, y);
        expect(pixel.color).to.equal(color);
        expect(pixel.placedBy).to.equal(user1.address);
        expect(pixel.timestamp).to.be.gt(0);
      });

      it("Should return zero values for unplaced pixels", async function () {
        const pixel = await megaplace.getPixel(100, 100);
        expect(pixel.color).to.equal(0);
        expect(pixel.placedBy).to.equal(ethers.ZeroAddress);
        expect(pixel.timestamp).to.equal(0);
      });

      it("Should reject invalid coordinates", async function () {
        await expect(megaplace.getPixel(CANVAS_RES, 0))
          .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");

        await expect(megaplace.getPixel(0, CANVAS_RES))
          .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");
      });
    });

    describe("getPixelBatch", function () {
      it("Should return multiple pixels correctly", async function () {
        await megaplace.connect(user1).placePixel(0, 0, 0xff0000);
        await increaseTime(15);
        await megaplace.connect(user2).placePixel(1, 1, 0x00ff00);

        const [colors, placedBy, timestamps] = await megaplace.getPixelBatch([0, 1], [0, 1]);

        expect(colors[0]).to.equal(0xff0000);
        expect(colors[1]).to.equal(0x00ff00);
        expect(placedBy[0]).to.equal(user1.address);
        expect(placedBy[1]).to.equal(user2.address);
        expect(timestamps[0]).to.be.gt(0);
        expect(timestamps[1]).to.be.gt(0);
      });

      it("Should reject array length mismatch", async function () {
        await expect(megaplace.getPixelBatch([0, 1], [0]))
          .to.be.revertedWithCustomError(megaplace, "ArrayLengthMismatch");
      });

      it("Should reject empty batch", async function () {
        await expect(megaplace.getPixelBatch([], []))
          .to.be.revertedWithCustomError(megaplace, "InvalidBatchSize")
          .withArgs(0, 1, 1000);
      });

      it("Should reject batch larger than 1000", async function () {
        const x = Array(1001).fill(0).map((_, i) => i % 1000);
        const y = Array(1001).fill(0);

        await expect(megaplace.getPixelBatch(x, y))
          .to.be.revertedWithCustomError(megaplace, "InvalidBatchSize")
          .withArgs(1001, 1, 1000);
      });

      it("Should accept batch of 1000 pixels", async function () {
        const x = Array(1000).fill(0).map((_, i) => i % 1000);
        const y = Array(1000).fill(0);

        const [colors, placedBy, timestamps] = await megaplace.getPixelBatch(x, y);
        expect(colors.length).to.equal(1000);
        expect(placedBy.length).to.equal(1000);
        expect(timestamps.length).to.equal(1000);
      });

      it("Should reject invalid coordinates in batch", async function () {
        await expect(megaplace.getPixelBatch([CANVAS_RES], [0]))
          .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");
      });
    });

    describe("getRegion", function () {
      it("Should return a region of pixels", async function () {
        await megaplace.connect(user1).placePixel(0, 0, 0xff0000);
        await increaseTime(15);
        await megaplace.connect(user1).placePixel(1, 0, 0x00ff00);
        await increaseTime(15);
        await megaplace.connect(user1).placePixel(0, 1, 0x0000ff);

        const colors = await megaplace.getRegion(0, 0, 2, 2);

        expect(colors.length).to.equal(4);
        expect(colors[0]).to.equal(0xff0000); // (0,0)
        expect(colors[1]).to.equal(0x00ff00); // (1,0)
        expect(colors[2]).to.equal(0x0000ff); // (0,1)
        expect(colors[3]).to.equal(0);        // (1,1) - unplaced
      });

      it("Should reject invalid start coordinates", async function () {
        await expect(megaplace.getRegion(CANVAS_RES, 0, 1, 1))
          .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");

        await expect(megaplace.getRegion(0, CANVAS_RES, 1, 1))
          .to.be.revertedWithCustomError(megaplace, "InvalidCoordinates");
      });

      it("Should reject region out of bounds", async function () {
        await expect(megaplace.getRegion(CANVAS_RES - 1, 0, 2, 1))
          .to.be.revertedWithCustomError(megaplace, "RegionOutOfBounds");

        await expect(megaplace.getRegion(0, CANVAS_RES - 1, 1, 2))
          .to.be.revertedWithCustomError(megaplace, "RegionOutOfBounds");
      });

      it("Should reject region too large", async function () {
        await expect(megaplace.getRegion(0, 0, 101, 100))
          .to.be.revertedWithCustomError(megaplace, "RegionTooLarge")
          .withArgs(10100, MAX_REGION_SIZE);
      });

      it("Should accept region at maximum size (100x100)", async function () {
        const colors = await megaplace.getRegion(0, 0, 100, 100);
        expect(colors.length).to.equal(10000);
      });

      it("Should reject zero width or height", async function () {
        await expect(megaplace.getRegion(0, 0, 0, 10))
          .to.be.revertedWithCustomError(megaplace, "InvalidDimensions");

        await expect(megaplace.getRegion(0, 0, 10, 0))
          .to.be.revertedWithCustomError(megaplace, "InvalidDimensions");
      });
    });

    describe("hasPremiumAccess", function () {
      it("Should return false for users without premium", async function () {
        const [hasAccess, expiryTime] = await megaplace.hasPremiumAccess(user1.address);
        expect(hasAccess).to.be.false;
        expect(expiryTime).to.equal(0);
      });

      it("Should return true for users with active premium", async function () {
        await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

        const [hasAccess, expiryTime] = await megaplace.hasPremiumAccess(user1.address);
        expect(hasAccess).to.be.true;
        expect(expiryTime).to.be.gt(0);
      });

      it("Should return false after premium expires", async function () {
        await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

        await increaseTime(2 * 60 * 60 + 1); // 2 hours + 1 second

        const [hasAccess] = await megaplace.hasPremiumAccess(user1.address);
        expect(hasAccess).to.be.false;
      });
    });

    describe("getCooldown", function () {
      it("Should return can place for new users with full pixel allowance", async function () {
        const [canPlace, cooldownRemaining, pixelsRemaining] = await megaplace.getCooldown(user1.address);
        expect(canPlace).to.be.true;
        expect(cooldownRemaining).to.equal(0);
        expect(pixelsRemaining).to.equal(15); // Full allowance
      });

      it("Should decrement pixels remaining after placing", async function () {
        await megaplace.connect(user1).placePixel(0, 0, 0xff0000);

        const [canPlace, cooldownRemaining, pixelsRemaining] = await megaplace.getCooldown(user1.address);
        expect(canPlace).to.be.true; // Can still place (14 remaining)
        expect(cooldownRemaining).to.equal(0); // No cooldown until limit is hit
        expect(pixelsRemaining).to.equal(14);
      });

      it("Should show no cooldown until 15 pixels placed", async function () {
        // Place 14 pixels
        for (let i = 0; i < 14; i++) {
          await megaplace.connect(user1).placePixel(i, 0, 0xff0000);
        }

        const [canPlace, cooldownRemaining, pixelsRemaining] = await megaplace.getCooldown(user1.address);
        expect(canPlace).to.be.true;
        expect(cooldownRemaining).to.equal(0); // No cooldown yet
        expect(pixelsRemaining).to.equal(1); // One more pixel before cooldown
      });

      it("Should return cannot place after hitting 15 pixel limit", async function () {
        // Place 15 pixels to hit limit and start cooldown
        for (let i = 0; i < 15; i++) {
          await megaplace.connect(user1).placePixel(i, 0, 0xff0000);
        }

        const [canPlace, cooldownRemaining, pixelsRemaining] = await megaplace.getCooldown(user1.address);
        expect(canPlace).to.be.false;
        expect(cooldownRemaining).to.be.gte(1);
        expect(cooldownRemaining).to.be.lte(5); // 5 second cooldown
        expect(pixelsRemaining).to.equal(0);
      });

      it("Should reset after 5 second cooldown expires", async function () {
        // Place 15 pixels to trigger cooldown
        for (let i = 0; i < 15; i++) {
          await megaplace.connect(user1).placePixel(i, 0, 0xff0000);
        }

        await increaseTime(5); // Wait for cooldown

        const [canPlace, cooldownRemaining, pixelsRemaining] = await megaplace.getCooldown(user1.address);
        expect(canPlace).to.be.true;
        expect(cooldownRemaining).to.equal(0);
        expect(pixelsRemaining).to.equal(15); // Reset to full
      });

      it("Should return can place for premium users always", async function () {
        await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

        // Place many pixels (premium users have no limit)
        for (let i = 0; i < 20; i++) {
          await megaplace.connect(user1).placePixel(i, 0, 0xff0000);
        }

        const [canPlace, cooldownRemaining, pixelsRemaining] = await megaplace.getCooldown(user1.address);
        expect(canPlace).to.be.true;
        expect(cooldownRemaining).to.equal(0);
        expect(pixelsRemaining).to.equal(15); // Premium users always have full allowance
      });

      it("Should enforce cooldown after premium expires", async function () {
        await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

        // Advance time to just after premium expires
        await increaseTime(2 * 60 * 60 + 1);

        // Place 15 pixels after premium has expired (triggers cooldown)
        for (let i = 0; i < 15; i++) {
          await megaplace.connect(user1).placePixel(i, 0, 0xff0000);
        }

        // Should now have cooldown enforced
        const [canPlace, cooldownRemaining, pixelsRemaining] = await megaplace.getCooldown(user1.address);
        expect(canPlace).to.be.false;
        expect(cooldownRemaining).to.be.gte(1);
        expect(cooldownRemaining).to.be.lte(5);
        expect(pixelsRemaining).to.equal(0);
      });
    });
  });

  describe("Transparent/Erase Functionality (Color 0)", function () {
    it("Should store color 0 without conversion", async function () {
      await megaplace.connect(user1).placePixel(100, 100, 0);

      const pixel = await megaplace.getPixel(100, 100);
      expect(pixel.color).to.equal(0);
      expect(pixel.placedBy).to.equal(user1.address);
      expect(pixel.timestamp).to.be.gt(0);
    });

    it("Should emit PixelPlaced event with color 0", async function () {
      const tx = await megaplace.connect(user1).placePixel(101, 101, 0);
      const receipt = await tx.wait();

      const event = receipt!.logs.find(
        (log: any) => log.fragment?.name === "PixelPlaced"
      ) as any;

      expect(event).to.not.be.undefined;
      expect(event.args.color).to.equal(0);
      expect(event.args.x).to.equal(101);
      expect(event.args.y).to.equal(101);
    });

    it("Should allow overwriting colored pixel with transparent (color 0)", async function () {
      // Place a red pixel
      await megaplace.connect(user1).placePixel(200, 200, 0xff0000);
      expect((await megaplace.getPixel(200, 200)).color).to.equal(0xff0000);

      // Overwrite with transparent
      await increaseTime(15);
      await megaplace.connect(user2).placePixel(200, 200, 0);

      const pixel = await megaplace.getPixel(200, 200);
      expect(pixel.color).to.equal(0);
      expect(pixel.placedBy).to.equal(user2.address);
    });

    it("Should allow overwriting transparent pixel with colored pixel", async function () {
      // Place a transparent pixel
      await megaplace.connect(user1).placePixel(201, 201, 0);
      expect((await megaplace.getPixel(201, 201)).color).to.equal(0);

      // Overwrite with colored
      await increaseTime(15);
      await megaplace.connect(user2).placePixel(201, 201, 0x00ff00);

      const pixel = await megaplace.getPixel(201, 201);
      expect(pixel.color).to.equal(0x00ff00);
      expect(pixel.placedBy).to.equal(user2.address);
    });

    it("Should store near-black (0x010101) correctly - frontend uses this for black", async function () {
      // Frontend should convert black (#000000) to 0x010101 before sending
      await megaplace.connect(user1).placePixel(202, 202, 0x010101);

      const pixel = await megaplace.getPixel(202, 202);
      expect(pixel.color).to.equal(0x010101);
      expect(pixel.placedBy).to.equal(user1.address);
    });

    it("Should distinguish between unplaced pixels and erased pixels", async function () {
      // Unplaced pixel has all zero values
      const unplacedPixel = await megaplace.getPixel(999, 999);
      expect(unplacedPixel.color).to.equal(0);
      expect(unplacedPixel.placedBy).to.equal(ethers.ZeroAddress);
      expect(unplacedPixel.timestamp).to.equal(0);

      // Erased pixel has color 0 but non-zero placedBy and timestamp
      await megaplace.connect(user1).placePixel(300, 300, 0);
      const erasedPixel = await megaplace.getPixel(300, 300);
      expect(erasedPixel.color).to.equal(0);
      expect(erasedPixel.placedBy).to.equal(user1.address);
      expect(erasedPixel.timestamp).to.be.gt(0);
    });

    it("Should handle batch with mixed colors including transparent", async function () {
      const x = [400, 401, 402, 403, 404];
      const y = [400, 401, 402, 403, 404];
      const colors = [0xff0000, 0, 0x00ff00, 0, 0x0000ff]; // red, transparent, green, transparent, blue

      await megaplace.connect(user1).placePixelBatch(x, y, colors);

      expect((await megaplace.getPixel(400, 400)).color).to.equal(0xff0000);
      expect((await megaplace.getPixel(401, 401)).color).to.equal(0);
      expect((await megaplace.getPixel(402, 402)).color).to.equal(0x00ff00);
      expect((await megaplace.getPixel(403, 403)).color).to.equal(0);
      expect((await megaplace.getPixel(404, 404)).color).to.equal(0x0000ff);
    });

    it("Should return color 0 in getRegion for erased pixels", async function () {
      // Place some pixels including transparent ones
      await megaplace.connect(user1).placePixel(500, 500, 0xff0000);
      await increaseTime(15);
      await megaplace.connect(user1).placePixel(501, 500, 0); // Transparent
      await increaseTime(15);
      await megaplace.connect(user1).placePixel(500, 501, 0x00ff00);

      const colors = await megaplace.getRegion(500, 500, 2, 2);

      expect(colors[0]).to.equal(0xff0000); // (500, 500)
      expect(colors[1]).to.equal(0);        // (501, 500) - transparent
      expect(colors[2]).to.equal(0x00ff00); // (500, 501)
      expect(colors[3]).to.equal(0);        // (501, 501) - unplaced
    });
  });

  describe("Edge Cases and Gas Optimization", function () {
    it("Should handle corner coordinates (0,0) and (999,999)", async function () {
      await megaplace.connect(user1).placePixel(0, 0, 0xff0000);
      await increaseTime(15);
      await megaplace.connect(user1).placePixel(999, 999, 0x00ff00);

      const pixel1 = await megaplace.getPixel(0, 0);
      const pixel2 = await megaplace.getPixel(999, 999);

      expect(pixel1.color).to.equal(0xff0000);
      expect(pixel2.color).to.equal(0x00ff00);
    });

    it("Should handle maximum color value (0xFFFFFFFF)", async function () {
      const maxColor = 0xffffffff;
      await megaplace.connect(user1).placePixel(0, 0, maxColor);

      const pixel = await megaplace.getPixel(0, 0);
      expect(pixel.color).to.equal(maxColor);
    });

    it("Should handle zero color value (transparent/unset)", async function () {
      await megaplace.connect(user1).placePixel(0, 0, 0);

      const pixel = await megaplace.getPixel(0, 0);
      expect(pixel.color).to.equal(0); // Color 0 = transparent/unset (frontend converts black to 0x010101)
      expect(pixel.placedBy).to.equal(user1.address); // Still should record who set it
    });

    it("Should properly track multiple premium purchases", async function () {
      await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

      // Advance time by 1 hour
      await increaseTime(60 * 60);

      // Purchase again (should extend from current time)
      await megaplace.connect(user1).grantPremiumAccess({ value: ethers.parseEther("0.01") });

      const [hasAccess, expiryTime] = await megaplace.hasPremiumAccess(user1.address);
      expect(hasAccess).to.be.true;

      // Should have ~2 hours from now (not 3 hours total)
      const expectedExpiry = BigInt(await getCurrentTime()) + BigInt(2 * 60 * 60);
      expect(expiryTime).to.be.closeTo(expectedExpiry, 10n);
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should use optimized storage for pixels (single slot)", async function () {
      // This is a conceptual test - the struct fits in one slot
      // We verify by checking successful operations
      await megaplace.connect(user1).placePixel(0, 0, 0xff0000);
      const pixel = await megaplace.getPixel(0, 0);

      expect(pixel.color).to.equal(0xff0000);
      expect(pixel.placedBy).to.not.equal(ethers.ZeroAddress);
      expect(pixel.timestamp).to.be.gt(0);
    });

    it("Should handle unchecked arithmetic correctly", async function () {
      // Test that unchecked blocks don't cause issues with valid inputs
      const x = 999;
      const y = 999;

      await megaplace.connect(user1).placePixel(x, y, 0xff0000);
      const pixel = await megaplace.getPixel(x, y);

      expect(pixel.color).to.equal(0xff0000);
    });
  });
});
