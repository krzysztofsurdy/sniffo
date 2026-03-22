<?php
namespace App\Repository;
use App\Entity\User;
class UserRepository extends BaseRepository {
    public function findByEmail(string $email): ?User { return null; }
    public function findActive(): array { return []; }
    public function findAll(): array { return []; }
}
