<?php
namespace App\Service;
use App\Entity\User;
interface UserServiceInterface {
    public function createUser(string $name, string $email): User;
    public function deactivateUser(User $user): void;
}
