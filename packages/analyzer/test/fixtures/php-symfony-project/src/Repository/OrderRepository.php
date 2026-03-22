<?php
namespace App\Repository;
use App\Entity\Order;
use App\Entity\User;
class OrderRepository extends BaseRepository {
    public function findByUser(User $user): array { return []; }
    public function findAll(): array { return []; }
}
