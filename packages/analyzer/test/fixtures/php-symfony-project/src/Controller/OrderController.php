<?php
namespace App\Controller;
use App\Service\OrderService;
use App\Entity\User;
class OrderController {
    public function __construct(
        private readonly OrderService $orderService,
    ) {}
    public function create(User $user, float $total): void {
        $this->orderService->createOrder($user, $total);
    }
}
