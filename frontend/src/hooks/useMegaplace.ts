import { useAccount, useReadContract, useWriteContract, useWatchContractEvent, usePublicClient, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import type { Abi } from 'viem';
import { MEGAPLACE_ADDRESS, MEGAPLACE_DEPLOYMENT_BLOCK } from '../contracts/config';
import MegaplaceABI from '../contracts/MegaplaceABI.json';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';

// Type definitions
export type Pixel = {
  color: number;
  placedBy: string;
  timestamp: bigint;
};

export type PixelPlacedEvent = {
  user: string;
  x: bigint;
  y: bigint;
  color: number;
  timestamp: bigint;
};

export type PixelsBatchPlacedEvent = {
  user: string;
  count: bigint;
  timestamp: bigint;
};

// Hook to get cooldown status
export function useCooldown() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: MEGAPLACE_ADDRESS,
    abi: MegaplaceABI,
    functionName: 'getCooldown',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 1000, // Refetch every second to update countdown
      retry: (failureCount, error: any) => {
        // Don't retry on rate limit errors
        if (error?.message?.includes('rate limit') || error?.message?.includes('-32005') || error?.code === -32005) {
          return false;
        }
        return failureCount < 3;
      },
    },
  });

  const canPlace = data?.[0] as boolean | undefined;
  const cooldownRemaining = data?.[1] as bigint | undefined;

  return {
    canPlace: canPlace ?? false,
    cooldownRemaining: cooldownRemaining ?? 0n,
    isLoading,
    refetch,
  };
}

// Hook to check premium access status
export function usePremiumAccess() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: MEGAPLACE_ADDRESS,
    abi: MegaplaceABI,
    functionName: 'hasPremiumAccess',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000, // Refetch every 5 seconds
      retry: (failureCount, error: any) => {
        // Don't retry on rate limit errors
        if (error?.message?.includes('rate limit') || error?.message?.includes('-32005') || error?.code === -32005) {
          return false;
        }
        return failureCount < 3;
      },
    },
  });

  const hasAccess = data?.[0] as boolean | undefined;
  const expiryTime = data?.[1] as bigint | undefined;

  return {
    hasAccess: hasAccess ?? false,
    expiryTime: expiryTime ?? 0n,
    isLoading,
    refetch,
  };
}

// Hook to place a pixel
export function usePlacePixel() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { refetch: refetchCooldown } = useCooldown();

  const placePixel = (x: number, y: number, color: number) => {
    writeContract(
      // @ts-expect-error - wagmi provides chain and account from config
      {
        address: MEGAPLACE_ADDRESS,
        abi: MegaplaceABI as Abi,
        functionName: 'placePixel',
        args: [BigInt(x), BigInt(y), color],
      },
      {
        onError: (error) => {
          if (error.message.includes('rate limit') || error.message.includes('-32005')) {
            toast.error('Rate Limited', {
              description: 'Request is being rate limited. Please try again in a moment.',
            });
          } else {
            toast.error('Failed to place pixel', {
              description: error.message,
            });
          }
        },
      }
    );
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Refetch cooldown after successful placement
  useEffect(() => {
    if (isConfirmed) {
      refetchCooldown();
    }
  }, [isConfirmed, refetchCooldown]);

  return {
    placePixel,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

// Hook to grant premium access
export function useGrantPremiumAccess() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { refetch: refetchPremium } = usePremiumAccess();

  const grantPremiumAccess = () => {
    writeContract(
      // @ts-expect-error - wagmi provides chain and account from config
      {
        address: MEGAPLACE_ADDRESS,
        abi: MegaplaceABI as Abi,
        functionName: 'grantPremiumAccess',
        value: parseEther('0.01'),
      },
      {
        onError: (error) => {
          if (error.message.includes('rate limit') || error.message.includes('-32005')) {
            toast.error('Rate Limited', {
              description: 'Request is being rate limited. Please try again in a moment.',
            });
          } else {
            toast.error('Failed to purchase premium', {
              description: error.message,
            });
          }
        },
      }
    );
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Refetch premium status after successful purchase
  useEffect(() => {
    if (isConfirmed) {
      refetchPremium();
    }
  }, [isConfirmed, refetchPremium]);

  return {
    grantPremiumAccess,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

// Hook to get a region of pixels
export function useGetRegion(startX: number, startY: number, width: number, height: number) {
  const { data, isLoading, refetch } = useReadContract({
    address: MEGAPLACE_ADDRESS,
    abi: MegaplaceABI,
    functionName: 'getRegion',
    args: [BigInt(startX), BigInt(startY), BigInt(width), BigInt(height)],
    query: {
      enabled: width > 0 && height > 0,
    },
  });

  return {
    colors: (data as number[] | undefined) ?? [],
    isLoading,
    refetch,
  };
}

// Hook to get a single pixel
export function useGetPixel(x: number, y: number) {
  const { data, isLoading, refetch } = useReadContract({
    address: MEGAPLACE_ADDRESS,
    abi: MegaplaceABI as Abi,
    functionName: 'getPixel',
    args: [BigInt(x), BigInt(y)],
    query: {
      enabled: x >= 0 && y >= 0 && x < 1000 && y < 1000,
    },
  });

  const color = data?.[0] as number | undefined;
  const placedBy = data?.[1] as string | undefined;
  const timestamp = data?.[2] as bigint | undefined;

  return {
    pixel: data ? {
      color: color ?? 0,
      placedBy: placedBy ?? '0x0000000000000000000000000000000000000000',
      timestamp: timestamp ?? 0n,
    } : null,
    isLoading,
    refetch,
  };
}

// Hook to get multiple pixels at once
export function useGetPixelBatch(xCoords: number[], yCoords: number[]) {
  const { data, isLoading, refetch } = useReadContract({
    address: MEGAPLACE_ADDRESS,
    abi: MegaplaceABI as Abi,
    functionName: 'getPixelBatch',
    args: [xCoords.map(x => BigInt(x)), yCoords.map(y => BigInt(y))],
    query: {
      enabled: xCoords.length > 0 && xCoords.length === yCoords.length && xCoords.length <= 1000,
    },
  });

  const colors = data?.[0] as number[] | undefined;
  const placedByAddresses = data?.[1] as string[] | undefined;
  const timestamps = data?.[2] as bigint[] | undefined;

  return {
    pixels: (colors && placedByAddresses && timestamps) ? colors.map((color, i) => ({
      color,
      placedBy: placedByAddresses[i],
      timestamp: timestamps[i],
    })) : [],
    isLoading,
    refetch,
  };
}

// Hook to place multiple pixels at once
export function usePlacePixelBatch() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { refetch: refetchCooldown } = useCooldown();

  const placePixelBatch = (xCoords: number[], yCoords: number[], colors: number[]) => {
    if (xCoords.length !== yCoords.length || xCoords.length !== colors.length) {
      throw new Error('Array lengths must match');
    }
    if (xCoords.length === 0 || xCoords.length > 100) {
      throw new Error('Batch size must be 1-100');
    }

    writeContract(
      // @ts-expect-error - wagmi provides chain and account from config
      {
        address: MEGAPLACE_ADDRESS,
        abi: MegaplaceABI as Abi,
        functionName: 'placePixelBatch',
        args: [
          xCoords.map(x => BigInt(x)),
          yCoords.map(y => BigInt(y)),
          colors.map(c => c),
        ],
      },
      {
        onError: (error) => {
          if (error.message.includes('rate limit') || error.message.includes('-32005')) {
            toast.error('Rate Limited', {
              description: 'Request is being rate limited. Please try again in a moment.',
            });
          } else {
            toast.error('Failed to place pixel batch', {
              description: error.message,
            });
          }
        },
      }
    );
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Refetch cooldown after successful batch placement
  useEffect(() => {
    if (isConfirmed) {
      refetchCooldown();
    }
  }, [isConfirmed, refetchCooldown]);

  return {
    placePixelBatch,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

// Hook to watch for pixel placed events
export function useWatchPixelPlaced(onPixelPlaced?: (event: PixelPlacedEvent) => void) {
  const [recentPixels, setRecentPixels] = useState<PixelPlacedEvent[]>([]);
  const publicClient = usePublicClient();

  // Use a ref to store the latest callback to avoid stale closures
  const onPixelPlacedRef = useRef(onPixelPlaced);
  useEffect(() => {
    onPixelPlacedRef.current = onPixelPlaced;
  }, [onPixelPlaced]);

  // Load recent historical events on mount - simplified to avoid rate limiting
  // Instead of querying all historical events, we'll rely on contract storage reads
  // and only watch for new real-time events
  useEffect(() => {
    const loadRecentPixelsFromStorage = async () => {
      if (!publicClient) return;

      try {
        console.log('Loading recent pixels from contract storage...');

        // Sample 100 random coordinates to find recently placed pixels
        // This avoids expensive historical event queries
        const SAMPLE_SIZE = 100;
        const CANVAS_SIZE = 1000;
        const recentPixelsList: PixelPlacedEvent[] = [];

        const sampleCoords: { x: number; y: number }[] = [];
        for (let i = 0; i < SAMPLE_SIZE; i++) {
          sampleCoords.push({
            x: Math.floor(Math.random() * CANVAS_SIZE),
            y: Math.floor(Math.random() * CANVAS_SIZE),
          });
        }

        // Batch read pixels
        const xCoords = sampleCoords.map(c => BigInt(c.x));
        const yCoords = sampleCoords.map(c => BigInt(c.y));

        // @ts-expect-error - viem type mismatch
        const pixelData = await publicClient.readContract({
          address: MEGAPLACE_ADDRESS,
          abi: MegaplaceABI,
          functionName: 'getPixelBatch',
          args: [xCoords, yCoords],
        });

        const colors = pixelData[0] as number[];
        const placedByAddresses = pixelData[1] as string[];
        const timestamps = pixelData[2] as bigint[];

        // Collect pixels that have been placed (color !== 0)
        for (let i = 0; i < SAMPLE_SIZE; i++) {
          const color = typeof colors[i] === 'bigint' ? Number(colors[i]) : colors[i];
          if (color !== 0) {
            recentPixelsList.push({
              user: placedByAddresses[i],
              x: BigInt(sampleCoords[i].x),
              y: BigInt(sampleCoords[i].y),
              color,
              timestamp: timestamps[i],
            });
          }
        }

        // Sort by timestamp and take most recent 20
        const sortedPixels = recentPixelsList
          .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))
          .slice(0, 20);

        console.log(`Found ${sortedPixels.length} recent pixels from storage sampling`);
        setRecentPixels(sortedPixels);

        // Notify callback for each pixel to update canvas
        if (onPixelPlacedRef.current) {
          sortedPixels.forEach(event => {
            onPixelPlacedRef.current?.(event);
          });
        }

        console.log('Recent pixels loaded from storage');
      } catch (error: any) {
        console.error('Error loading recent pixels from storage:', error);
        if (error?.message?.includes('rate limit') || error?.message?.includes('-32005') || error?.code === -32005) {
          toast.error('Rate Limited', {
            description: 'Unable to load recent pixels. The RPC is being rate limited.',
          });
        }
      }
    };

    loadRecentPixelsFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient]); // Only depend on publicClient to avoid infinite loops

  // MegaETH Realtime API: Manual polling with getLogs
  // This avoids filter expiration issues and works reliably with all RPC providers
  const lastProcessedBlockRef = useRef<bigint>(0n);

  useEffect(() => {
    if (!publicClient) return;

    let isActive = true;
    let intervalId: NodeJS.Timeout;

    const pollForNewEvents = async () => {
      if (!isActive) return;

      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = lastProcessedBlockRef.current === 0n
          ? currentBlock
          : lastProcessedBlockRef.current + 1n;

        // Only fetch if there are new blocks
        if (fromBlock <= currentBlock) {
          const logs = await publicClient.getLogs({
            address: MEGAPLACE_ADDRESS,
            event: {
              type: 'event',
              name: 'PixelPlaced',
              inputs: [
                { type: 'address', name: 'user', indexed: true },
                { type: 'uint256', name: 'x', indexed: false },
                { type: 'uint256', name: 'y', indexed: false },
                { type: 'uint32', name: 'color', indexed: false },
                { type: 'uint256', name: 'timestamp', indexed: false },
              ],
            },
            fromBlock,
            toBlock: currentBlock,
          });

          if (logs.length > 0) {
            console.log(`[Event Watch] Received ${logs.length} new PixelPlaced events (blocks ${fromBlock}-${currentBlock})`);

            logs.forEach((log: any) => {
              try {
                if (!log.args) {
                  console.warn('[Event Watch] Log missing args:', log);
                  return;
                }

                const user = log.args.user as string;
                const xRaw = log.args.x;
                const yRaw = log.args.y;
                const colorRaw = log.args.color;
                const timestampRaw = log.args.timestamp;

                const x = typeof xRaw === 'bigint' ? xRaw : BigInt(xRaw);
                const y = typeof yRaw === 'bigint' ? yRaw : BigInt(yRaw);
                const color = typeof colorRaw === 'bigint' ? Number(colorRaw) : Number(colorRaw);
                const timestamp = typeof timestampRaw === 'bigint' ? timestampRaw : BigInt(timestampRaw);

                const event: PixelPlacedEvent = {
                  user,
                  x,
                  y,
                  color,
                  timestamp,
                };

                console.log(`[Event Watch] Pixel placed at (${Number(x)}, ${Number(y)}) with color ${color} by ${user.slice(0, 8)}...`);

                setRecentPixels(prev => {
                  const isDuplicate = prev.some(
                    p => p.x === event.x && p.y === event.y && p.timestamp === event.timestamp
                  );
                  if (isDuplicate) {
                    console.log(`[Event Watch] Skipping duplicate pixel at (${Number(x)}, ${Number(y)})`);
                    return prev;
                  }

                  return [event, ...prev].slice(0, 20);
                });

                console.log('[Event Watch] Calling onPixelPlaced callback');
                onPixelPlacedRef.current?.(event);
              } catch (error) {
                console.error('[Event Watch] Error processing pixel event:', error, log);
              }
            });
          }

          lastProcessedBlockRef.current = currentBlock;
        }
      } catch (error: any) {
        console.error('[Event Watch] Error polling for events:', error);
        if (error?.message?.includes('rate limit') || error?.message?.includes('-32005') || error?.code === -32005) {
          toast.error('Rate Limited', {
            description: 'Event polling paused due to rate limiting.',
          });
        }
      }
    };

    // Initial poll
    pollForNewEvents();

    // Set up polling interval - check every 500ms for MegaETH's fast blocks
    intervalId = setInterval(pollForNewEvents, 500);

    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [publicClient]);

  return { recentPixels };
}

// Utility function to convert RGB to uint32 color format
export function rgbToUint32(r: number, g: number, b: number): number {
  // Use >>> 0 to ensure the result is a positive 32-bit integer, not BigInt
  return (((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0;
}

// Utility function to convert uint32 color to RGB
export function uint32ToRgb(color: number | bigint): { r: number; g: number; b: number } {
  // Convert BigInt to number if necessary
  const colorNum = typeof color === 'bigint' ? Number(color) : color;
  return {
    r: (colorNum >> 16) & 0xFF,
    g: (colorNum >> 8) & 0xFF,
    b: colorNum & 0xFF,
  };
}

// Utility function to convert uint32 color to hex string
export function uint32ToHex(color: number | bigint): string {
  const rgb = uint32ToRgb(color);
  return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
}

// Utility function to convert hex string to uint32
export function hexToUint32(hex: string): number {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16) || 0;
  const g = parseInt(cleaned.substring(2, 4), 16) || 0;
  const b = parseInt(cleaned.substring(4, 6), 16) || 0;
  // Ensure we return a number, not a BigInt
  return Number(rgbToUint32(r, g, b));
}

// Admin Hooks (owner-only functions)

// Hook to grant premium access to a user (admin only)
export function useAdminGrantPremiumAccess() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const adminGrantPremiumAccess = (userAddress: string) => {
    // @ts-expect-error - wagmi provides chain and account from config
    writeContract({
      address: MEGAPLACE_ADDRESS,
      abi: MegaplaceABI as Abi,
      functionName: 'adminGrantPremiumAccess',
      args: [userAddress],
    });
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  return {
    adminGrantPremiumAccess,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

// Hook to grant premium access to multiple users (admin only)
export function useAdminGrantPremiumAccessBatch() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const adminGrantPremiumAccessBatch = (userAddresses: string[]) => {
    // @ts-expect-error - wagmi provides chain and account from config
    writeContract({
      address: MEGAPLACE_ADDRESS,
      abi: MegaplaceABI as Abi,
      functionName: 'adminGrantPremiumAccessBatch',
      args: [userAddresses],
    });
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  return {
    adminGrantPremiumAccessBatch,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

// Hook to withdraw contract balance (admin only)
export function useWithdraw() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const withdraw = () => {
    // @ts-expect-error - wagmi provides chain and account from config
    writeContract({
      address: MEGAPLACE_ADDRESS,
      abi: MegaplaceABI as Abi,
      functionName: 'withdraw',
    });
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  return {
    withdraw,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

// Hook to watch for batch pixel placement events
export function useWatchPixelsBatchPlaced(onBatchPlaced?: (event: PixelsBatchPlacedEvent) => void) {
  useWatchContractEvent({
    address: MEGAPLACE_ADDRESS,
    abi: MegaplaceABI as Abi,
    eventName: 'PixelsBatchPlaced',
    poll: true,
    pollingInterval: 100,
    onLogs(logs) {
      logs.forEach((log: any) => {
        try {
          if (!log.args) {
            console.warn('Batch log missing args:', log);
            return;
          }

          const user = log.args.user as string;
          const countRaw = log.args.count;
          const timestampRaw = log.args.timestamp;

          const count = typeof countRaw === 'bigint' ? countRaw : BigInt(countRaw);
          const timestamp = typeof timestampRaw === 'bigint' ? timestampRaw : BigInt(timestampRaw);

          const event: PixelsBatchPlacedEvent = {
            user,
            count,
            timestamp,
          };

          onBatchPlaced?.(event);
        } catch (error) {
          console.error('Error processing batch pixel event:', error, log);
        }
      });
    },
  });
}
