<?php
namespace App\Service;
use App\Entity\Order;
use App\Entity\User;
use App\Repository\OrderRepository;
class OrderService {
    public function __construct(
        private readonly OrderRepository $orderRepository,
    ) {}
    public function createOrder(User $user, float $total): Order {
        return new Order($user, $total);
    }
    public function getOrdersForUser(User $user): array {
        return $this->orderRepository->findByUser($user);
    }
}
