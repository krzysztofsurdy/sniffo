<?php
namespace App\Entity;
use App\Enum\OrderStatus;
class Order {
    public function __construct(
        private readonly User $user,
        private readonly float $total,
        private OrderStatus $status = OrderStatus::Pending,
    ) {}
    public function getUser(): User { return $this->user; }
    public function getTotal(): float { return $this->total; }
}
